const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getPool, sql } = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

// Get all assignments for a task
router.get('/task/:taskId', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('task_id', sql.Int, req.params.taskId)
            .query(`SELECT a.*, e.fio, e.email, e.phone
                FROM Assignment a
                JOIN Employee e ON a.employee_id = e.employee_id
                WHERE a.task_id = @task_id
                ORDER BY a.date_from`);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get assignments error:', err);
        res.status(500).json({ error: 'Ошибка получения назначений' });
    }
});

// Get assignments for an employee
router.get('/employee/:employeeId', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('employee_id', sql.Int, req.params.employeeId)
            .query(`SELECT a.*, t.name as task_name, p.name as project_name, s.name as status_name
                FROM Assignment a
                JOIN Task t ON a.task_id = t.task_id
                JOIN Project p ON t.project_id = p.project_id
                LEFT JOIN Status s ON t.status_id = s.status_id
                WHERE a.employee_id = @employee_id
                ORDER BY a.date_from DESC`);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get employee assignments error:', err);
        res.status(500).json({ error: 'Ошибка получения назначений сотрудника' });
    }
});

// Get current user's assignments
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('employee_id', sql.Int, req.user.employee_id)
            .query(`SELECT a.*, t.name as task_name, t.description as task_description,
                    t.priority, t.start_plan, t.end_plan, t.effort_plan,
                    p.name as project_name, s.name as status_name,
                    (SELECT ISNULL(SUM(te.hours), 0) FROM Time_entry te WHERE te.assignment_id = a.assignment_id) as hours_spent
                FROM Assignment a
                JOIN Task t ON a.task_id = t.task_id
                JOIN Project p ON t.project_id = p.project_id
                LEFT JOIN Status s ON t.status_id = s.status_id
                WHERE a.employee_id = @employee_id
                ORDER BY t.priority DESC, a.date_from`);

        res.json(result.recordset);
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
        const employee = await pool.request()
            .input('employee_id', sql.Int, employee_id)
            .query('SELECT employee_id FROM Employee WHERE employee_id = @employee_id AND active = 1');

        if (employee.recordset.length === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден или неактивен' });
        }

        // Check if task exists
        const task = await pool.request()
            .input('task_id', sql.Int, task_id)
            .query('SELECT task_id FROM Task WHERE task_id = @task_id');

        if (task.recordset.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        // Check for existing assignment
        const existing = await pool.request()
            .input('employee_id', sql.Int, employee_id)
            .input('task_id', sql.Int, task_id)
            .query('SELECT assignment_id FROM Assignment WHERE employee_id = @employee_id AND task_id = @task_id');

        if (existing.recordset.length > 0) {
            return res.status(400).json({ error: 'Сотрудник уже назначен на эту задачу' });
        }

        // Get next ID
        const maxIdResult = await pool.request()
            .query('SELECT ISNULL(MAX(assignment_id), 0) + 1 as next_id FROM Assignment');
        const nextId = maxIdResult.recordset[0].next_id;

        await pool.request()
            .input('assignment_id', sql.Int, nextId)
            .input('employee_id', sql.Int, employee_id)
            .input('task_id', sql.Int, task_id)
            .input('role_on_task', sql.VarChar, role_on_task)
            .input('allocation_pct', sql.Int, allocation_pct)
            .input('hourly_rate', sql.Decimal, hourly_rate)
            .input('date_from', sql.DateTime, new Date(date_from))
            .input('date_to', sql.DateTime, new Date(date_to))
            .query(`INSERT INTO Assignment (assignment_id, employee_id, task_id, role_on_task, allocation_pct, hourly_rate, date_from, date_to)
                    VALUES (@assignment_id, @employee_id, @task_id, @role_on_task, @allocation_pct, @hourly_rate, @date_from, @date_to)`);

        res.status(201).json({
            message: 'Назначение создано',
            assignment_id: nextId
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
        const existing = await pool.request()
            .input('assignment_id', sql.Int, req.params.id)
            .query('SELECT assignment_id FROM Assignment WHERE assignment_id = @assignment_id');

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Назначение не найдено' });
        }

        let updateQuery = 'UPDATE Assignment SET ';
        const updates = [];
        const request = pool.request();
        request.input('assignment_id', sql.Int, req.params.id);

        if (role_on_task !== undefined) {
            updates.push('role_on_task = @role_on_task');
            request.input('role_on_task', sql.VarChar, role_on_task);
        }
        if (allocation_pct !== undefined) {
            updates.push('allocation_pct = @allocation_pct');
            request.input('allocation_pct', sql.Int, allocation_pct);
        }
        if (hourly_rate !== undefined) {
            updates.push('hourly_rate = @hourly_rate');
            request.input('hourly_rate', sql.Decimal, hourly_rate);
        }
        if (date_from !== undefined) {
            updates.push('date_from = @date_from');
            request.input('date_from', sql.DateTime, new Date(date_from));
        }
        if (date_to !== undefined) {
            updates.push('date_to = @date_to');
            request.input('date_to', sql.DateTime, new Date(date_to));
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        updateQuery += updates.join(', ') + ' WHERE assignment_id = @assignment_id';
        await request.query(updateQuery);

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
        await pool.request()
            .input('assignment_id', sql.Int, req.params.id)
            .query('DELETE FROM Time_entry WHERE assignment_id = @assignment_id');

        const result = await pool.request()
            .input('assignment_id', sql.Int, req.params.id)
            .query('DELETE FROM Assignment WHERE assignment_id = @assignment_id');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Назначение не найдено' });
        }

        res.json({ message: 'Назначение удалено' });
    } catch (err) {
        console.error('Delete assignment error:', err);
        res.status(500).json({ error: 'Ошибка удаления назначения' });
    }
});

module.exports = router;
