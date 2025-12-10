const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getPool, sql } = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

// Get time entries for an assignment
router.get('/assignment/:assignmentId', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('assignment_id', sql.Int, req.params.assignmentId)
            .query(`SELECT * FROM Time_entry
                WHERE assignment_id = @assignment_id
                ORDER BY work_date DESC`);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get time entries error:', err);
        res.status(500).json({ error: 'Ошибка получения записей времени' });
    }
});

// Get time entries for current user
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const pool = await getPool();

        let query = `SELECT te.*, a.task_id, t.name as task_name, p.name as project_name
            FROM Time_entry te
            JOIN Assignment a ON te.assignment_id = a.assignment_id
            JOIN Task t ON a.task_id = t.task_id
            JOIN Project p ON t.project_id = p.project_id
            WHERE a.employee_id = @employee_id`;

        const request = pool.request();
        request.input('employee_id', sql.Int, req.user.employee_id);

        if (start_date) {
            query += ' AND te.work_date >= @start_date';
            request.input('start_date', sql.DateTime, new Date(start_date));
        }

        if (end_date) {
            query += ' AND te.work_date <= @end_date';
            request.input('end_date', sql.DateTime, new Date(end_date));
        }

        query += ' ORDER BY te.work_date DESC';

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get my time entries error:', err);
        res.status(500).json({ error: 'Ошибка получения записей времени' });
    }
});

// Get time entries for a task
router.get('/task/:taskId', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('task_id', sql.Int, req.params.taskId)
            .query(`SELECT te.*, e.fio as employee_name
                FROM Time_entry te
                JOIN Assignment a ON te.assignment_id = a.assignment_id
                JOIN Employee e ON a.employee_id = e.employee_id
                WHERE a.task_id = @task_id
                ORDER BY te.work_date DESC`);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get task time entries error:', err);
        res.status(500).json({ error: 'Ошибка получения записей времени' });
    }
});

// Create time entry
router.post('/', authenticateToken, [
    body('assignment_id').isInt().withMessage('Выберите назначение'),
    body('work_date').isISO8601().withMessage('Некорректная дата'),
    body('hours').isFloat({ min: 0.5, max: 24 }).withMessage('Часы должны быть от 0.5 до 24'),
    body('comment').trim().notEmpty().withMessage('Комментарий обязателен')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { assignment_id, work_date, hours, comment } = req.body;
        const pool = await getPool();

        // Check if assignment exists and belongs to user (for non-managers)
        const assignment = await pool.request()
            .input('assignment_id', sql.Int, assignment_id)
            .query('SELECT employee_id, task_id FROM Assignment WHERE assignment_id = @assignment_id');

        if (assignment.recordset.length === 0) {
            return res.status(404).json({ error: 'Назначение не найдено' });
        }

        // Check permission
        if (req.user.role === 'Исполнитель' && assignment.recordset[0].employee_id !== req.user.employee_id) {
            return res.status(403).json({ error: 'Вы можете списывать время только на свои задачи' });
        }

        // Validate date (not more than 7 days ago)
        const workDateObj = new Date(work_date);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        if (workDateObj < sevenDaysAgo) {
            return res.status(400).json({ error: 'Нельзя списать время за дату более 7 дней назад' });
        }

        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (workDateObj > today) {
            return res.status(400).json({ error: 'Нельзя списать время на будущую дату' });
        }

        // Check total hours for the day
        const existingHours = await pool.request()
            .input('employee_id', sql.Int, req.user.employee_id)
            .input('work_date', sql.DateTime, workDateObj)
            .query(`SELECT ISNULL(SUM(te.hours), 0) as total_hours
                FROM Time_entry te
                JOIN Assignment a ON te.assignment_id = a.assignment_id
                WHERE a.employee_id = @employee_id
                AND CAST(te.work_date AS DATE) = CAST(@work_date AS DATE)`);

        const totalHours = existingHours.recordset[0].total_hours + hours;
        if (totalHours > 24) {
            return res.status(400).json({
                error: `Нельзя списать более 24 часов в день. Уже списано: ${existingHours.recordset[0].total_hours} ч.`
            });
        }

        // Get next ID
        const maxIdResult = await pool.request()
            .query('SELECT ISNULL(MAX(time_entry_id), 0) + 1 as next_id FROM Time_entry');
        const nextId = maxIdResult.recordset[0].next_id;

        await pool.request()
            .input('time_entry_id', sql.Int, nextId)
            .input('assignment_id', sql.Int, assignment_id)
            .input('work_date', sql.DateTime, workDateObj)
            .input('hours', sql.Float, hours)
            .input('comment', sql.VarChar, comment)
            .query(`INSERT INTO Time_entry (time_entry_id, assignment_id, work_date, hours, comment)
                    VALUES (@time_entry_id, @assignment_id, @work_date, @hours, @comment)`);

        // Update project budget_fact
        const taskResult = await pool.request()
            .input('assignment_id', sql.Int, assignment_id)
            .query(`SELECT t.project_id, a.hourly_rate
                FROM Assignment a
                JOIN Task t ON a.task_id = t.task_id
                WHERE a.assignment_id = @assignment_id`);

        if (taskResult.recordset.length > 0) {
            const { project_id, hourly_rate } = taskResult.recordset[0];
            const costIncrease = hours * hourly_rate;

            await pool.request()
                .input('project_id', sql.Int, project_id)
                .input('cost_increase', sql.Decimal, costIncrease)
                .query('UPDATE Project SET budget_fact = budget_fact + @cost_increase WHERE project_id = @project_id');
        }

        res.status(201).json({
            message: 'Время списано',
            time_entry_id: nextId
        });
    } catch (err) {
        console.error('Create time entry error:', err);
        res.status(500).json({ error: 'Ошибка списания времени' });
    }
});

// Update time entry
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();

        // Check if time entry exists and get assignment info
        const existing = await pool.request()
            .input('time_entry_id', sql.Int, req.params.id)
            .query(`SELECT te.*, a.employee_id, a.hourly_rate, t.project_id
                FROM Time_entry te
                JOIN Assignment a ON te.assignment_id = a.assignment_id
                JOIN Task t ON a.task_id = t.task_id
                WHERE te.time_entry_id = @time_entry_id`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Запись не найдена' });
        }

        const entry = existing.recordset[0];

        // Check permission
        if (req.user.role === 'Исполнитель' && entry.employee_id !== req.user.employee_id) {
            return res.status(403).json({ error: 'Вы можете редактировать только свои записи' });
        }

        const { hours, comment } = req.body;

        if (hours !== undefined) {
            if (hours < 0.5 || hours > 24) {
                return res.status(400).json({ error: 'Часы должны быть от 0.5 до 24' });
            }

            // Update project budget_fact
            const hoursDiff = hours - entry.hours;
            const costDiff = hoursDiff * entry.hourly_rate;

            await pool.request()
                .input('project_id', sql.Int, entry.project_id)
                .input('cost_diff', sql.Decimal, costDiff)
                .query('UPDATE Project SET budget_fact = budget_fact + @cost_diff WHERE project_id = @project_id');
        }

        let updateQuery = 'UPDATE Time_entry SET ';
        const updates = [];
        const request = pool.request();
        request.input('time_entry_id', sql.Int, req.params.id);

        if (hours !== undefined) {
            updates.push('hours = @hours');
            request.input('hours', sql.Float, hours);
        }
        if (comment !== undefined) {
            updates.push('comment = @comment');
            request.input('comment', sql.VarChar, comment);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        updateQuery += updates.join(', ') + ' WHERE time_entry_id = @time_entry_id';
        await request.query(updateQuery);

        res.json({ message: 'Запись обновлена' });
    } catch (err) {
        console.error('Update time entry error:', err);
        res.status(500).json({ error: 'Ошибка обновления записи' });
    }
});

// Delete time entry
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();

        // Check if time entry exists and get info
        const existing = await pool.request()
            .input('time_entry_id', sql.Int, req.params.id)
            .query(`SELECT te.*, a.employee_id, a.hourly_rate, t.project_id
                FROM Time_entry te
                JOIN Assignment a ON te.assignment_id = a.assignment_id
                JOIN Task t ON a.task_id = t.task_id
                WHERE te.time_entry_id = @time_entry_id`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Запись не найдена' });
        }

        const entry = existing.recordset[0];

        // Check permission
        if (req.user.role === 'Исполнитель' && entry.employee_id !== req.user.employee_id) {
            return res.status(403).json({ error: 'Вы можете удалять только свои записи' });
        }

        // Update project budget_fact
        const costDecrease = entry.hours * entry.hourly_rate;
        await pool.request()
            .input('project_id', sql.Int, entry.project_id)
            .input('cost_decrease', sql.Decimal, costDecrease)
            .query('UPDATE Project SET budget_fact = budget_fact - @cost_decrease WHERE project_id = @project_id');

        await pool.request()
            .input('time_entry_id', sql.Int, req.params.id)
            .query('DELETE FROM Time_entry WHERE time_entry_id = @time_entry_id');

        res.json({ message: 'Запись удалена' });
    } catch (err) {
        console.error('Delete time entry error:', err);
        res.status(500).json({ error: 'Ошибка удаления записи' });
    }
});

module.exports = router;
