const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getPool } = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

// Get time entries for an assignment
router.get('/assignment/:assignmentId', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.query(
            `SELECT * FROM Time_entry
             WHERE assignment_id = $1
             ORDER BY work_date DESC`,
            [req.params.assignmentId]
        );

        res.json(result.rows);
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
            WHERE a.employee_id = $1`;
        const params = [req.user.employee_id];
        let paramIndex = 2;

        if (start_date) {
            query += ` AND te.work_date >= $${paramIndex}`;
            params.push(new Date(start_date));
            paramIndex++;
        }

        if (end_date) {
            query += ` AND te.work_date <= $${paramIndex}`;
            params.push(new Date(end_date));
            paramIndex++;
        }

        query += ' ORDER BY te.work_date DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Get my time entries error:', err);
        res.status(500).json({ error: 'Ошибка получения записей времени' });
    }
});

// Get time entries for a task
router.get('/task/:taskId', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.query(
            `SELECT te.*, e.fio as employee_name
             FROM Time_entry te
             JOIN Assignment a ON te.assignment_id = a.assignment_id
             JOIN Employee e ON a.employee_id = e.employee_id
             WHERE a.task_id = $1
             ORDER BY te.work_date DESC`,
            [req.params.taskId]
        );

        res.json(result.rows);
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
        const assignment = await pool.query(
            'SELECT employee_id, task_id FROM Assignment WHERE assignment_id = $1',
            [assignment_id]
        );

        if (assignment.rows.length === 0) {
            return res.status(404).json({ error: 'Назначение не найдено' });
        }

        // Check permission
        if (req.user.role === 'Исполнитель' && assignment.rows[0].employee_id !== req.user.employee_id) {
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
        const existingHours = await pool.query(
            `SELECT COALESCE(SUM(te.hours), 0) as total_hours
             FROM Time_entry te
             JOIN Assignment a ON te.assignment_id = a.assignment_id
             WHERE a.employee_id = $1
             AND DATE(te.work_date) = DATE($2)`,
            [req.user.employee_id, workDateObj]
        );

        const totalHours = parseFloat(existingHours.rows[0].total_hours) + hours;
        if (totalHours > 24) {
            return res.status(400).json({
                error: `Нельзя списать более 24 часов в день. Уже списано: ${existingHours.rows[0].total_hours} ч.`
            });
        }

        const result = await pool.query(
            `INSERT INTO Time_entry (assignment_id, work_date, hours, comment)
             VALUES ($1, $2, $3, $4)
             RETURNING time_entry_id`,
            [assignment_id, workDateObj, hours, comment]
        );

        // Update project budget_fact
        const taskResult = await pool.query(
            `SELECT t.project_id, a.hourly_rate
             FROM Assignment a
             JOIN Task t ON a.task_id = t.task_id
             WHERE a.assignment_id = $1`,
            [assignment_id]
        );

        if (taskResult.rows.length > 0) {
            const { project_id, hourly_rate } = taskResult.rows[0];
            const costIncrease = hours * parseFloat(hourly_rate);

            await pool.query(
                'UPDATE Project SET budget_fact = budget_fact + $1 WHERE project_id = $2',
                [costIncrease, project_id]
            );
        }

        res.status(201).json({
            message: 'Время списано',
            time_entry_id: result.rows[0].time_entry_id
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
        const existing = await pool.query(
            `SELECT te.*, a.employee_id, a.hourly_rate, t.project_id
             FROM Time_entry te
             JOIN Assignment a ON te.assignment_id = a.assignment_id
             JOIN Task t ON a.task_id = t.task_id
             WHERE te.time_entry_id = $1`,
            [req.params.id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Запись не найдена' });
        }

        const entry = existing.rows[0];

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
            const hoursDiff = hours - parseFloat(entry.hours);
            const costDiff = hoursDiff * parseFloat(entry.hourly_rate);

            await pool.query(
                'UPDATE Project SET budget_fact = budget_fact + $1 WHERE project_id = $2',
                [costDiff, entry.project_id]
            );
        }

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (hours !== undefined) {
            updates.push(`hours = $${paramIndex}`);
            params.push(hours);
            paramIndex++;
        }
        if (comment !== undefined) {
            updates.push(`comment = $${paramIndex}`);
            params.push(comment);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        params.push(req.params.id);
        const updateQuery = `UPDATE Time_entry SET ${updates.join(', ')} WHERE time_entry_id = $${paramIndex}`;
        await pool.query(updateQuery, params);

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
        const existing = await pool.query(
            `SELECT te.*, a.employee_id, a.hourly_rate, t.project_id
             FROM Time_entry te
             JOIN Assignment a ON te.assignment_id = a.assignment_id
             JOIN Task t ON a.task_id = t.task_id
             WHERE te.time_entry_id = $1`,
            [req.params.id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Запись не найдена' });
        }

        const entry = existing.rows[0];

        // Check permission
        if (req.user.role === 'Исполнитель' && entry.employee_id !== req.user.employee_id) {
            return res.status(403).json({ error: 'Вы можете удалять только свои записи' });
        }

        // Update project budget_fact
        const costDecrease = parseFloat(entry.hours) * parseFloat(entry.hourly_rate);
        await pool.query(
            'UPDATE Project SET budget_fact = budget_fact - $1 WHERE project_id = $2',
            [costDecrease, entry.project_id]
        );

        await pool.query(
            'DELETE FROM Time_entry WHERE time_entry_id = $1',
            [req.params.id]
        );

        res.json({ message: 'Запись удалена' });
    } catch (err) {
        console.error('Delete time entry error:', err);
        res.status(500).json({ error: 'Ошибка удаления записи' });
    }
});

module.exports = router;
