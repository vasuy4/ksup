const express = require('express');
const router = express.Router();
const { getPool } = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Ensure reports directory exists
const reportsDir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

// Font paths for Cyrillic support
const fontsDir = path.join(__dirname, '..', 'fonts');
const fontRegular = path.join(fontsDir, 'Roboto-Regular.ttf');
const fontBold = path.join(fontsDir, 'Roboto-Bold.ttf');

// Get project report data
router.get('/project/:projectId', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();

        // Get project info
        const projectResult = await pool.query(
            'SELECT * FROM Project WHERE project_id = $1',
            [req.params.projectId]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        const project = projectResult.rows[0];

        // Get task statistics
        const taskStats = await pool.query(
            `SELECT
                COUNT(*) as total_tasks,
                SUM(CASE WHEN s.name = 'Создана' THEN 1 ELSE 0 END) as new_tasks,
                SUM(CASE WHEN s.name = 'В работе' THEN 1 ELSE 0 END) as in_progress_tasks,
                SUM(CASE WHEN s.name = 'На проверке' THEN 1 ELSE 0 END) as review_tasks,
                SUM(CASE WHEN s.name = 'Завершена' THEN 1 ELSE 0 END) as completed_tasks,
                SUM(CASE WHEN s.name = 'Отменена' THEN 1 ELSE 0 END) as cancelled_tasks,
                COALESCE(SUM(t.effort_plan), 0) as effort_plan_total
            FROM Task t
            LEFT JOIN Status s ON t.status_id = s.status_id
            WHERE t.project_id = $1`,
            [req.params.projectId]
        );

        // Get actual effort
        const effortResult = await pool.query(
            `SELECT COALESCE(SUM(te.hours), 0) as effort_fact_total
             FROM Time_entry te
             JOIN Assignment a ON te.assignment_id = a.assignment_id
             JOIN Task t ON a.task_id = t.task_id
             WHERE t.project_id = $1`,
            [req.params.projectId]
        );

        // Get team members
        const teamResult = await pool.query(
            `SELECT DISTINCT e.employee_id, e.fio, e.email,
                (SELECT SUM(te.hours) FROM Time_entry te
                    JOIN Assignment a2 ON te.assignment_id = a2.assignment_id
                    JOIN Task t2 ON a2.task_id = t2.task_id
                    WHERE a2.employee_id = e.employee_id AND t2.project_id = $1) as hours_spent
            FROM Employee e
            JOIN Assignment a ON e.employee_id = a.employee_id
            JOIN Task t ON a.task_id = t.task_id
            WHERE t.project_id = $1`,
            [req.params.projectId]
        );

        res.json({
            project,
            taskStats: taskStats.rows[0],
            effortFact: effortResult.rows[0].effort_fact_total,
            team: teamResult.rows
        });
    } catch (err) {
        console.error('Get project report error:', err);
        res.status(500).json({ error: 'Ошибка формирования отчёта' });
    }
});

// Get employee workload report
router.get('/workload', authenticateToken, requireManager, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const pool = await getPool();

        let query = `
            SELECT e.employee_id, e.fio, e.email, e.role,
                (SELECT COUNT(DISTINCT a2.task_id) FROM Assignment a2 WHERE a2.employee_id = e.employee_id) as total_tasks,
                (SELECT COALESCE(SUM(te.hours), 0) FROM Time_entry te
                    JOIN Assignment a ON te.assignment_id = a.assignment_id
                    WHERE a.employee_id = e.employee_id`;

        const params = [];
        let paramIndex = 1;

        if (start_date && end_date) {
            query += ` AND te.work_date >= $${paramIndex} AND te.work_date <= $${paramIndex + 1}`;
            params.push(new Date(start_date));
            params.push(new Date(end_date));
            paramIndex += 2;
        }

        query += `) as hours_spent
            FROM Employee e
            WHERE e.active = TRUE
            ORDER BY e.fio`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Get workload report error:', err);
        res.status(500).json({ error: 'Ошибка формирования отчёта по загрузке' });
    }
});

// Export project report to PDF
router.get('/project/:projectId/pdf', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();

        // Get project info
        const projectResult = await pool.query(
            'SELECT * FROM Project WHERE project_id = $1',
            [req.params.projectId]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        const project = projectResult.rows[0];

        // Get task statistics
        const taskStats = await pool.query(
            `SELECT
                COUNT(*) as total_tasks,
                SUM(CASE WHEN s.name = 'Создана' THEN 1 ELSE 0 END) as new_tasks,
                SUM(CASE WHEN s.name = 'В работе' THEN 1 ELSE 0 END) as in_progress_tasks,
                SUM(CASE WHEN s.name = 'На проверке' THEN 1 ELSE 0 END) as review_tasks,
                SUM(CASE WHEN s.name = 'Завершена' THEN 1 ELSE 0 END) as completed_tasks,
                COALESCE(SUM(t.effort_plan), 0) as effort_plan_total
            FROM Task t
            LEFT JOIN Status s ON t.status_id = s.status_id
            WHERE t.project_id = $1`,
            [req.params.projectId]
        );

        const effortResult = await pool.query(
            `SELECT COALESCE(SUM(te.hours), 0) as effort_fact_total
             FROM Time_entry te
             JOIN Assignment a ON te.assignment_id = a.assignment_id
             JOIN Task t ON a.task_id = t.task_id
             WHERE t.project_id = $1`,
            [req.params.projectId]
        );

        const stats = taskStats.rows[0];
        const effortFact = effortResult.rows[0].effort_fact_total;

        // Create PDF with custom font for Cyrillic support
        const doc = new PDFDocument({ margin: 50 });

        // Register fonts for Cyrillic support
        doc.registerFont('Roboto', fontRegular);
        doc.registerFont('Roboto-Bold', fontBold);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=project_${project.project_id}_report.pdf`);

        doc.pipe(res);

        // Title
        doc.font('Roboto-Bold').fontSize(20).text('Отчёт по проекту', { align: 'center' });
        doc.moveDown();

        // Project info
        doc.font('Roboto-Bold').fontSize(16).text(project.name);
        doc.moveDown(0.5);
        doc.font('Roboto').fontSize(12).text(`Описание: ${project.description || 'Не указано'}`);
        doc.text(`Приоритет: ${project.priority}`);
        doc.text(`Статус: ${project.is_archived ? 'Архивирован' : 'Активен'}`);
        doc.moveDown();

        // Dates
        doc.font('Roboto-Bold').fontSize(14).text('Сроки проекта');
        doc.font('Roboto').fontSize(12);
        doc.text(`План. начало: ${new Date(project.start_plan).toLocaleDateString('ru-RU')}`);
        doc.text(`План. окончание: ${new Date(project.end_plan).toLocaleDateString('ru-RU')}`);
        if (project.start_actual) {
            doc.text(`Факт. начало: ${new Date(project.start_actual).toLocaleDateString('ru-RU')}`);
        }
        if (project.end_actual) {
            doc.text(`Факт. окончание: ${new Date(project.end_actual).toLocaleDateString('ru-RU')}`);
        }
        doc.moveDown();

        // Budget
        doc.font('Roboto-Bold').fontSize(14).text('Бюджет');
        doc.font('Roboto').fontSize(12);
        doc.text(`Плановый бюджет: ${parseFloat(project.budget_plan).toLocaleString('ru-RU')} руб.`);
        doc.text(`Фактический бюджет: ${parseFloat(project.budget_fact).toLocaleString('ru-RU')} руб.`);
        const budgetDiff = parseFloat(project.budget_plan) - parseFloat(project.budget_fact);
        doc.text(`Отклонение: ${budgetDiff >= 0 ? '+' : ''}${budgetDiff.toLocaleString('ru-RU')} руб.`);
        doc.moveDown();

        // Task statistics
        doc.font('Roboto-Bold').fontSize(14).text('Статистика задач');
        doc.font('Roboto').fontSize(12);
        doc.text(`Всего задач: ${stats.total_tasks}`);
        doc.text(`Создано: ${stats.new_tasks}`);
        doc.text(`В работе: ${stats.in_progress_tasks}`);
        doc.text(`На проверке: ${stats.review_tasks}`);
        doc.text(`Завершено: ${stats.completed_tasks}`);
        doc.moveDown();

        // Effort
        doc.font('Roboto-Bold').fontSize(14).text('Трудозатраты');
        doc.font('Roboto').fontSize(12);
        doc.text(`Плановые трудозатраты: ${stats.effort_plan_total} ч.`);
        doc.text(`Фактические трудозатраты: ${effortFact} ч.`);
        const effortDiff = parseFloat(stats.effort_plan_total) - parseFloat(effortFact);
        doc.text(`Отклонение: ${effortDiff >= 0 ? '+' : ''}${effortDiff} ч.`);

        // Footer
        doc.moveDown(2);
        doc.font('Roboto').fontSize(10).text(`Отчёт сформирован: ${new Date().toLocaleString('ru-RU')}`, { align: 'right' });

        doc.end();
    } catch (err) {
        console.error('Export PDF error:', err);
        res.status(500).json({ error: 'Ошибка экспорта в PDF' });
    }
});

// Export project report to Excel
router.get('/project/:projectId/excel', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();

        // Get project info
        const projectResult = await pool.query(
            'SELECT * FROM Project WHERE project_id = $1',
            [req.params.projectId]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        const project = projectResult.rows[0];

        // Get tasks
        const tasksResult = await pool.query(
            `SELECT t.*, s.name as status_name,
                (SELECT STRING_AGG(e.fio, ', ') FROM Assignment a
                    JOIN Employee e ON a.employee_id = e.employee_id
                    WHERE a.task_id = t.task_id) as assignees,
                (SELECT COALESCE(SUM(te.hours), 0) FROM Time_entry te
                    JOIN Assignment a ON te.assignment_id = a.assignment_id
                    WHERE a.task_id = t.task_id) as hours_spent
            FROM Task t
            LEFT JOIN Status s ON t.status_id = s.status_id
            WHERE t.project_id = $1
            ORDER BY t.priority DESC`,
            [req.params.projectId]
        );

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'KSUP';
        workbook.created = new Date();

        // Project info sheet
        const infoSheet = workbook.addWorksheet('Информация о проекте');
        infoSheet.columns = [
            { header: 'Параметр', key: 'param', width: 30 },
            { header: 'Значение', key: 'value', width: 50 }
        ];
        infoSheet.addRows([
            { param: 'Название', value: project.name },
            { param: 'Описание', value: project.description },
            { param: 'Приоритет', value: project.priority },
            { param: 'Статус', value: project.is_archived ? 'Архивирован' : 'Активен' },
            { param: 'Плановое начало', value: new Date(project.start_plan).toLocaleDateString('ru-RU') },
            { param: 'Плановое окончание', value: new Date(project.end_plan).toLocaleDateString('ru-RU') },
            { param: 'Фактическое начало', value: project.start_actual ? new Date(project.start_actual).toLocaleDateString('ru-RU') : '-' },
            { param: 'Фактическое окончание', value: project.end_actual ? new Date(project.end_actual).toLocaleDateString('ru-RU') : '-' },
            { param: 'Плановый бюджет', value: parseFloat(project.budget_plan) },
            { param: 'Фактический бюджет', value: parseFloat(project.budget_fact) }
        ]);

        // Style header
        infoSheet.getRow(1).font = { bold: true };
        infoSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Tasks sheet
        const tasksSheet = workbook.addWorksheet('Задачи');
        tasksSheet.columns = [
            { header: 'ID', key: 'task_id', width: 8 },
            { header: 'Название', key: 'name', width: 30 },
            { header: 'Статус', key: 'status_name', width: 15 },
            { header: 'Приоритет', key: 'priority', width: 10 },
            { header: 'Исполнители', key: 'assignees', width: 30 },
            { header: 'План. начало', key: 'start_plan', width: 15 },
            { header: 'План. окончание', key: 'end_plan', width: 15 },
            { header: 'План. часы', key: 'effort_plan', width: 12 },
            { header: 'Факт. часы', key: 'hours_spent', width: 12 }
        ];

        tasksResult.rows.forEach(task => {
            tasksSheet.addRow({
                task_id: task.task_id,
                name: task.name,
                status_name: task.status_name,
                priority: task.priority,
                assignees: task.assignees || '-',
                start_plan: new Date(task.start_plan).toLocaleDateString('ru-RU'),
                end_plan: new Date(task.end_plan).toLocaleDateString('ru-RU'),
                effort_plan: task.effort_plan,
                hours_spent: parseFloat(task.hours_spent)
            });
        });

        // Style header
        tasksSheet.getRow(1).font = { bold: true };
        tasksSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=project_${project.project_id}_report.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Export Excel error:', err);
        res.status(500).json({ error: 'Ошибка экспорта в Excel' });
    }
});

// Export workload report to Excel
router.get('/workload/excel', authenticateToken, requireManager, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const pool = await getPool();

        let query = `
            SELECT e.employee_id, e.fio, e.email, e.role,
                (SELECT COUNT(DISTINCT a2.task_id) FROM Assignment a2 WHERE a2.employee_id = e.employee_id) as total_tasks,
                (SELECT COALESCE(SUM(te.hours), 0) FROM Time_entry te
                    JOIN Assignment a ON te.assignment_id = a.assignment_id
                    WHERE a.employee_id = e.employee_id`;

        const params = [];
        let paramIndex = 1;

        if (start_date && end_date) {
            query += ` AND te.work_date >= $${paramIndex} AND te.work_date <= $${paramIndex + 1}`;
            params.push(new Date(start_date));
            params.push(new Date(end_date));
            paramIndex += 2;
        }

        query += `) as hours_spent
            FROM Employee e
            WHERE e.active = TRUE
            ORDER BY e.fio`;

        const result = await pool.query(query, params);

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'KSUP';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Загрузка сотрудников');
        sheet.columns = [
            { header: 'ID', key: 'employee_id', width: 8 },
            { header: 'ФИО', key: 'fio', width: 30 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Роль', key: 'role', width: 15 },
            { header: 'Задач', key: 'total_tasks', width: 10 },
            { header: 'Часов', key: 'hours_spent', width: 10 }
        ];

        result.rows.forEach(emp => {
            sheet.addRow({
                ...emp,
                hours_spent: parseFloat(emp.hours_spent)
            });
        });

        // Style header
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=workload_report.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Export workload Excel error:', err);
        res.status(500).json({ error: 'Ошибка экспорта отчёта по загрузке' });
    }
});

module.exports = router;
