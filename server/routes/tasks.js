const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getPool } = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

// Get all tasks (with filters)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { project_id, status_id, search, assigned_to } = req.query;
        const pool = await getPool();

        let query = `SELECT t.*, p.name as project_name, s.name as status_name,
            (SELECT STRING_AGG(e.fio, ', ') FROM Assignment a
                JOIN Employee e ON a.employee_id = e.employee_id
                WHERE a.task_id = t.task_id) as assignees
            FROM Task t
            LEFT JOIN Project p ON t.project_id = p.project_id
            LEFT JOIN Status s ON t.status_id = s.status_id
            WHERE 1=1`;
        const params = [];
        let paramIndex = 1;

        // If user is Исполнитель, only show assigned tasks
        if (req.user.role === 'Исполнитель') {
            query += ` AND t.task_id IN (SELECT task_id FROM Assignment WHERE employee_id = $${paramIndex})`;
            params.push(req.user.employee_id);
            paramIndex++;
        }

        if (project_id) {
            query += ` AND t.project_id = $${paramIndex}`;
            params.push(parseInt(project_id));
            paramIndex++;
        }

        if (status_id) {
            query += ` AND t.status_id = $${paramIndex}`;
            params.push(parseInt(status_id));
            paramIndex++;
        }

        if (search) {
            query += ` AND (t.name ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (assigned_to) {
            query += ` AND t.task_id IN (SELECT task_id FROM Assignment WHERE employee_id = $${paramIndex})`;
            params.push(parseInt(assigned_to));
            paramIndex++;
        }

        query += ' ORDER BY t.priority DESC, t.start_plan';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Get tasks error:', err);
        res.status(500).json({ error: 'Ошибка получения списка задач' });
    }
});

// Get tasks by project (for Kanban board)
router.get('/project/:projectId/kanban', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();

        const result = await pool.query(
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
            ORDER BY t.priority DESC, t.start_plan`,
            [req.params.projectId]
        );

        // Group by status
        const statuses = await pool.query('SELECT * FROM Status ORDER BY status_id');
        const kanban = {};

        statuses.rows.forEach(status => {
            kanban[status.name] = result.rows.filter(task => task.status_name === status.name);
        });

        res.json(kanban);
    } catch (err) {
        console.error('Get kanban error:', err);
        res.status(500).json({ error: 'Ошибка получения канбан-доски' });
    }
});

// Get task by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.query(
            `SELECT t.*, p.name as project_name, s.name as status_name,
                (SELECT COALESCE(SUM(te.hours), 0) FROM Time_entry te
                    JOIN Assignment a ON te.assignment_id = a.assignment_id
                    WHERE a.task_id = t.task_id) as hours_spent
            FROM Task t
            LEFT JOIN Project p ON t.project_id = p.project_id
            LEFT JOIN Status s ON t.status_id = s.status_id
            WHERE t.task_id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        // Get assignments
        const assignments = await pool.query(
            `SELECT a.*, e.fio, e.email FROM Assignment a
             JOIN Employee e ON a.employee_id = e.employee_id
             WHERE a.task_id = $1`,
            [req.params.id]
        );

        const task = result.rows[0];
        task.assignments = assignments.rows;

        res.json(task);
    } catch (err) {
        console.error('Get task error:', err);
        res.status(500).json({ error: 'Ошибка получения данных задачи' });
    }
});

// Create task
router.post('/', authenticateToken, requireManager, [
    body('name').trim().notEmpty().withMessage('Название задачи обязательно'),
    body('project_id').isInt().withMessage('Выберите проект'),
    body('priority').isInt({ min: 1, max: 5 }).withMessage('Приоритет должен быть от 1 до 5'),
    body('start_plan').isISO8601().withMessage('Некорректная дата начала'),
    body('end_plan').isISO8601().withMessage('Некорректная дата окончания'),
    body('effort_plan').isFloat({ min: 0 }).withMessage('Плановые трудозатраты должны быть положительным числом')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, description, project_id, priority, start_plan, end_plan, effort_plan } = req.body;
        const pool = await getPool();

        // Check if project exists and not archived
        const project = await pool.query(
            'SELECT project_id, is_archived FROM Project WHERE project_id = $1',
            [project_id]
        );

        if (project.rows.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        if (project.rows[0].is_archived) {
            return res.status(400).json({ error: 'Нельзя создать задачу в архивном проекте' });
        }

        // Get default status (Создана)
        const status = await pool.query("SELECT status_id FROM Status WHERE name = 'Создана'");
        const statusId = status.rows[0]?.status_id || 1;

        const result = await pool.query(
            `INSERT INTO Task (project_id, status_id, name, description, priority, start_plan, end_plan, effort_plan)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING task_id`,
            [project_id, statusId, name, description || '', priority, new Date(start_plan), new Date(end_plan), effort_plan]
        );

        res.status(201).json({
            message: 'Задача успешно создана',
            task_id: result.rows[0].task_id
        });
    } catch (err) {
        console.error('Create task error:', err);
        res.status(500).json({ error: 'Ошибка создания задачи' });
    }
});

// Update task
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();

        // Check if task exists
        const existing = await pool.query(
            'SELECT task_id, project_id FROM Task WHERE task_id = $1',
            [req.params.id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        // If user is Исполнитель, check if they are assigned to this task
        if (req.user.role === 'Исполнитель') {
            const assignment = await pool.query(
                'SELECT assignment_id FROM Assignment WHERE task_id = $1 AND employee_id = $2',
                [req.params.id, req.user.employee_id]
            );

            if (assignment.rows.length === 0) {
                return res.status(403).json({ error: 'Доступ запрещён' });
            }

            // Исполнитель can only change status
            const { status_id } = req.body;
            if (Object.keys(req.body).some(key => key !== 'status_id')) {
                return res.status(403).json({ error: 'Исполнитель может изменять только статус задачи' });
            }
        }

        const { name, description, priority, start_plan, end_plan, effort_plan, start_actual, end_actual, status_id } = req.body;

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (name !== undefined) {
            if (!name.trim()) {
                return res.status(400).json({ error: 'Название задачи не может быть пустым' });
            }
            updates.push(`name = $${paramIndex}`);
            params.push(name);
            paramIndex++;
        }
        if (description !== undefined) {
            updates.push(`description = $${paramIndex}`);
            params.push(description);
            paramIndex++;
        }
        if (priority !== undefined) {
            updates.push(`priority = $${paramIndex}`);
            params.push(priority);
            paramIndex++;
        }
        if (start_plan !== undefined) {
            updates.push(`start_plan = $${paramIndex}`);
            params.push(new Date(start_plan));
            paramIndex++;
        }
        if (end_plan !== undefined) {
            updates.push(`end_plan = $${paramIndex}`);
            params.push(new Date(end_plan));
            paramIndex++;
        }
        if (effort_plan !== undefined) {
            updates.push(`effort_plan = $${paramIndex}`);
            params.push(effort_plan);
            paramIndex++;
        }
        if (start_actual !== undefined) {
            updates.push(`start_actual = $${paramIndex}`);
            params.push(start_actual ? new Date(start_actual) : null);
            paramIndex++;
        }
        if (end_actual !== undefined) {
            updates.push(`end_actual = $${paramIndex}`);
            params.push(end_actual ? new Date(end_actual) : null);
            paramIndex++;
        }
        if (status_id !== undefined) {
            updates.push(`status_id = $${paramIndex}`);
            params.push(status_id);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        params.push(req.params.id);
        const updateQuery = `UPDATE Task SET ${updates.join(', ')} WHERE task_id = $${paramIndex}`;
        await pool.query(updateQuery, params);

        res.json({ message: 'Задача обновлена' });
    } catch (err) {
        console.error('Update task error:', err);
        res.status(500).json({ error: 'Ошибка обновления задачи' });
    }
});

// Change task status
router.patch('/:id/status', authenticateToken, async (req, res) => {
    try {
        const { status_id } = req.body;

        if (!status_id) {
            return res.status(400).json({ error: 'Укажите новый статус' });
        }

        const pool = await getPool();

        // Check if task exists
        const existing = await pool.query(
            'SELECT task_id FROM Task WHERE task_id = $1',
            [req.params.id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        // If user is Исполнитель, check if they are assigned
        if (req.user.role === 'Исполнитель') {
            const assignment = await pool.query(
                'SELECT assignment_id FROM Assignment WHERE task_id = $1 AND employee_id = $2',
                [req.params.id, req.user.employee_id]
            );

            if (assignment.rows.length === 0) {
                return res.status(403).json({ error: 'Доступ запрещён' });
            }
        }

        // Check if status exists
        const status = await pool.query(
            'SELECT status_id, name FROM Status WHERE status_id = $1',
            [status_id]
        );

        if (status.rows.length === 0) {
            return res.status(404).json({ error: 'Статус не найден' });
        }

        // Update status and set actual dates if needed
        const statusName = status.rows[0].name;
        let updateQuery = 'UPDATE Task SET status_id = $1';
        const params = [status_id];

        if (statusName === 'В работе') {
            updateQuery += ', start_actual = COALESCE(start_actual, NOW())';
        } else if (statusName === 'Завершена') {
            updateQuery += ', end_actual = NOW()';
        }

        updateQuery += ' WHERE task_id = $2';
        params.push(req.params.id);

        await pool.query(updateQuery, params);

        res.json({ message: 'Статус задачи изменён' });
    } catch (err) {
        console.error('Change task status error:', err);
        res.status(500).json({ error: 'Ошибка изменения статуса' });
    }
});

// Delete task
router.delete('/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const pool = await getPool();

        // Delete related records first
        await pool.query(
            `DELETE FROM Time_entry WHERE assignment_id IN (SELECT assignment_id FROM Assignment WHERE task_id = $1)`,
            [req.params.id]
        );

        await pool.query(
            'DELETE FROM Assignment WHERE task_id = $1',
            [req.params.id]
        );

        const result = await pool.query(
            'DELETE FROM Task WHERE task_id = $1',
            [req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        res.json({ message: 'Задача удалена' });
    } catch (err) {
        console.error('Delete task error:', err);
        res.status(500).json({ error: 'Ошибка удаления задачи' });
    }
});

module.exports = router;
