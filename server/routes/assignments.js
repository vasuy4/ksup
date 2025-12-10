const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getPool } = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

// Get all assignments for a task
router.get('/task/:taskId', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.query(
            `SELECT a.*, e.fio, e.email, e.phone
             FROM Assignment a
             JOIN Employee e ON a.employee_id = e.employee_id
             WHERE a.task_id = $1
             ORDER BY a.date_from`,
            [req.params.taskId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Get assignments error:', err);
        res.status(500).json({ error: 'Ошибка получения назначений' });
    }
});

// Get assignments for an employee
router.get('/employee/:employeeId', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.query(
            `SELECT a.*, t.name as task_name, p.name as project_name, s.name as status_name
             FROM Assignment a
             JOIN Task t ON a.task_id = t.task_id
             JOIN Project p ON t.project_id = p.project_id
             LEFT JOIN Status s ON t.status_id = s.status_id
             WHERE a.employee_id = $1
             ORDER BY a.date_from DESC`,
            [req.params.employeeId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Get employee assignments error:', err);
        res.status(500).json({ error: 'Ошибка получения назначений сотрудника' });
    }
});

// Get current user's assignments
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.query(
            `SELECT a.*, t.name as task_name, t.description as task_description,
                    t.priority, t.start_plan, t.end_plan, t.effort_plan,
                    p.name as project_name, s.name as status_name,
                    (SELECT COALESCE(SUM(te.hours), 0) FROM Time_entry te WHERE te.assignment_id = a.assignment_id) as hours_spent
             FROM Assignment a
             JOIN Task t ON a.task_id = t.task_id
             JOIN Project p ON t.project_id = p.project_id
             LEFT JOIN Status s ON t.status_id = s.status_id
             WHERE a.employee_id = $1
             ORDER BY t.priority DESC, a.date_from`,
            [req.user.employee_id]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Get my assignments error:', err);
        res.status(500).json({ error: 'Ошибка получения ваших назначений' });
    }
});

// Create assignment
router.post('/', authenticateToken, requireManager, [
    body('employee_id').isInt().withMessage('Выберите сотрудника'),
    body('task_id').isInt().withMessage('Выберите задачу'),
    body('role_on_task').trim().notEmpty().withMessage('Укажите роль на задаче'),
    body('allocation_pct').isInt({ min: 1, max: 100 }).withMessage('Процент загрузки должен быть от 1 до 100'),
    body('hourly_rate').isFloat({ min: 0 }).withMessage('Ставка должна быть положительным числом'),
    body('date_from').isISO8601().withMessage('Некорректная дата начала'),
    body('date_to').isISO8601().withMessage('Некорректная дата окончания')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { employee_id, task_id, role_on_task, allocation_pct, hourly_rate, date_from, date_to } = req.body;
        const pool = await getPool();

        // Check if employee exists and is active
        const employee = await pool.query(
            'SELECT employee_id FROM Employee WHERE employee_id = $1 AND active = TRUE',
            [employee_id]
        );

        if (employee.rows.length === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден или неактивен' });
        }

        // Check if task exists
        const task = await pool.query(
            'SELECT task_id FROM Task WHERE task_id = $1',
            [task_id]
        );

        if (task.rows.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        // Check for existing assignment
        const existing = await pool.query(
            'SELECT assignment_id FROM Assignment WHERE employee_id = $1 AND task_id = $2',
            [employee_id, task_id]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Сотрудник уже назначен на эту задачу' });
        }

        const result = await pool.query(
            `INSERT INTO Assignment (employee_id, task_id, role_on_task, allocation_pct, hourly_rate, date_from, date_to)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING assignment_id`,
            [employee_id, task_id, role_on_task, allocation_pct, hourly_rate, new Date(date_from), new Date(date_to)]
        );

        res.status(201).json({
            message: 'Назначение создано',
            assignment_id: result.rows[0].assignment_id
        });
    } catch (err) {
        console.error('Create assignment error:', err);
        res.status(500).json({ error: 'Ошибка создания назначения' });
    }
});

// Update assignment
router.put('/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const { role_on_task, allocation_pct, hourly_rate, date_from, date_to } = req.body;
        const pool = await getPool();

        // Check if assignment exists
        const existing = await pool.query(
            'SELECT assignment_id FROM Assignment WHERE assignment_id = $1',
            [req.params.id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Назначение не найдено' });
        }

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (role_on_task !== undefined) {
            updates.push(`role_on_task = $${paramIndex}`);
            params.push(role_on_task);
            paramIndex++;
        }
        if (allocation_pct !== undefined) {
            updates.push(`allocation_pct = $${paramIndex}`);
            params.push(allocation_pct);
            paramIndex++;
        }
        if (hourly_rate !== undefined) {
            updates.push(`hourly_rate = $${paramIndex}`);
            params.push(hourly_rate);
            paramIndex++;
        }
        if (date_from !== undefined) {
            updates.push(`date_from = $${paramIndex}`);
            params.push(new Date(date_from));
            paramIndex++;
        }
        if (date_to !== undefined) {
            updates.push(`date_to = $${paramIndex}`);
            params.push(new Date(date_to));
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        params.push(req.params.id);
        const updateQuery = `UPDATE Assignment SET ${updates.join(', ')} WHERE assignment_id = $${paramIndex}`;
        await pool.query(updateQuery, params);

        res.json({ message: 'Назначение обновлено' });
    } catch (err) {
        console.error('Update assignment error:', err);
        res.status(500).json({ error: 'Ошибка обновления назначения' });
    }
});

// Delete assignment
router.delete('/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const pool = await getPool();

        // Delete related time entries first
        await pool.query(
            'DELETE FROM Time_entry WHERE assignment_id = $1',
            [req.params.id]
        );

        const result = await pool.query(
            'DELETE FROM Assignment WHERE assignment_id = $1',
            [req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Назначение не найдено' });
        }

        res.json({ message: 'Назначение удалено' });
    } catch (err) {
        console.error('Delete assignment error:', err);
        res.status(500).json({ error: 'Ошибка удаления назначения' });
    }
});

module.exports = router;
