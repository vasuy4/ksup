const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getPool, sql } = require('../config/database');
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
        const request = pool.request();

        // If user is Исполнитель, only show assigned tasks
        if (req.user.role === 'Исполнитель') {
            query += ` AND t.task_id IN (SELECT task_id FROM Assignment WHERE employee_id = @employee_id)`;
            request.input('employee_id', sql.Int, req.user.employee_id);
        }

        if (project_id) {
            query += ' AND t.project_id = @project_id';
            request.input('project_id', sql.Int, parseInt(project_id));
        }

        if (status_id) {
            query += ' AND t.status_id = @status_id';
            request.input('status_id', sql.Int, parseInt(status_id));
        }

        if (search) {
            query += ' AND (t.name LIKE @search OR t.description LIKE @search)';
            request.input('search', sql.VarChar, `%${search}%`);
        }

        if (assigned_to) {
            query += ' AND t.task_id IN (SELECT task_id FROM Assignment WHERE employee_id = @assigned_to)';
            request.input('assigned_to', sql.Int, parseInt(assigned_to));
        }

        query += ' ORDER BY t.priority DESC, t.start_plan';

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get tasks error:', err);
        res.status(500).json({ error: 'Ошибка получения списка задач' });
    }
});

// Get tasks by project (for Kanban board)
router.get('/project/:projectId/kanban', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('project_id', sql.Int, req.params.projectId)
            .query(`
                SELECT t.*, s.name as status_name,
                    (SELECT STRING_AGG(e.fio, ', ') FROM Assignment a
                        JOIN Employee e ON a.employee_id = e.employee_id
                        WHERE a.task_id = t.task_id) as assignees,
                    (SELECT ISNULL(SUM(te.hours), 0) FROM Time_entry te
                        JOIN Assignment a ON te.assignment_id = a.assignment_id
                        WHERE a.task_id = t.task_id) as hours_spent
                FROM Task t
                LEFT JOIN Status s ON t.status_id = s.status_id
                WHERE t.project_id = @project_id
                ORDER BY t.priority DESC, t.start_plan
            `);

        // Group by status
        const statuses = await pool.request().query('SELECT * FROM Status ORDER BY status_id');
        const kanban = {};

        statuses.recordset.forEach(status => {
            kanban[status.name] = result.recordset.filter(task => task.status_name === status.name);
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
        const result = await pool.request()
            .input('task_id', sql.Int, req.params.id)
            .query(`SELECT t.*, p.name as project_name, s.name as status_name,
                (SELECT ISNULL(SUM(te.hours), 0) FROM Time_entry te
                    JOIN Assignment a ON te.assignment_id = a.assignment_id
                    WHERE a.task_id = t.task_id) as hours_spent
                FROM Task t
                LEFT JOIN Project p ON t.project_id = p.project_id
                LEFT JOIN Status s ON t.status_id = s.status_id
                WHERE t.task_id = @task_id`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        // Get assignments
        const assignments = await pool.request()
            .input('task_id', sql.Int, req.params.id)
            .query(`SELECT a.*, e.fio, e.email FROM Assignment a
                JOIN Employee e ON a.employee_id = e.employee_id
                WHERE a.task_id = @task_id`);

        const task = result.recordset[0];
        task.assignments = assignments.recordset;

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
        const project = await pool.request()
            .input('project_id', sql.Int, project_id)
            .query('SELECT project_id, is_archived FROM Project WHERE project_id = @project_id');

        if (project.recordset.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        if (project.recordset[0].is_archived) {
            return res.status(400).json({ error: 'Нельзя создать задачу в архивном проекте' });
        }

        // Get default status (Создана)
        const status = await pool.request()
            .query("SELECT status_id FROM Status WHERE name = 'Создана'");
        const statusId = status.recordset[0]?.status_id || 1;

        // Get next ID
        const maxIdResult = await pool.request()
            .query('SELECT ISNULL(MAX(task_id), 0) + 1 as next_id FROM Task');
        const nextId = maxIdResult.recordset[0].next_id;

        await pool.request()
            .input('task_id', sql.Int, nextId)
            .input('project_id', sql.Int, project_id)
            .input('status_id', sql.Int, statusId)
            .input('name', sql.VarChar, name)
            .input('description', sql.VarChar, description || '')
            .input('priority', sql.Int, priority)
            .input('start_plan', sql.DateTime, new Date(start_plan))
            .input('end_plan', sql.DateTime, new Date(end_plan))
            .input('effort_plan', sql.Float, effort_plan)
            .query(`INSERT INTO Task (task_id, project_id, status_id, name, description, priority, start_plan, end_plan, effort_plan)
                    VALUES (@task_id, @project_id, @status_id, @name, @description, @priority, @start_plan, @end_plan, @effort_plan)`);

        res.status(201).json({
            message: 'Задача успешно создана',
            task_id: nextId
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
        const existing = await pool.request()
            .input('task_id', sql.Int, req.params.id)
            .query('SELECT task_id, project_id FROM Task WHERE task_id = @task_id');

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        // If user is Исполнитель, check if they are assigned to this task
        if (req.user.role === 'Исполнитель') {
            const assignment = await pool.request()
                .input('task_id', sql.Int, req.params.id)
                .input('employee_id', sql.Int, req.user.employee_id)
                .query('SELECT assignment_id FROM Assignment WHERE task_id = @task_id AND employee_id = @employee_id');

            if (assignment.recordset.length === 0) {
                return res.status(403).json({ error: 'Доступ запрещён' });
            }

            // Исполнитель can only change status
            const { status_id } = req.body;
            if (Object.keys(req.body).some(key => key !== 'status_id')) {
                return res.status(403).json({ error: 'Исполнитель может изменять только статус задачи' });
            }
        }

        const { name, description, priority, start_plan, end_plan, effort_plan, start_actual, end_actual, status_id } = req.body;

        let updateQuery = 'UPDATE Task SET ';
        const updates = [];
        const request = pool.request();
        request.input('task_id', sql.Int, req.params.id);

        if (name !== undefined) {
            if (!name.trim()) {
                return res.status(400).json({ error: 'Название задачи не может быть пустым' });
            }
            updates.push('name = @name');
            request.input('name', sql.VarChar, name);
        }
        if (description !== undefined) {
            updates.push('description = @description');
            request.input('description', sql.VarChar, description);
        }
        if (priority !== undefined) {
            updates.push('priority = @priority');
            request.input('priority', sql.Int, priority);
        }
        if (start_plan !== undefined) {
            updates.push('start_plan = @start_plan');
            request.input('start_plan', sql.DateTime, new Date(start_plan));
        }
        if (end_plan !== undefined) {
            updates.push('end_plan = @end_plan');
            request.input('end_plan', sql.DateTime, new Date(end_plan));
        }
        if (effort_plan !== undefined) {
            updates.push('effort_plan = @effort_plan');
            request.input('effort_plan', sql.Float, effort_plan);
        }
        if (start_actual !== undefined) {
            updates.push('start_actual = @start_actual');
            request.input('start_actual', sql.DateTime, start_actual ? new Date(start_actual) : null);
        }
        if (end_actual !== undefined) {
            updates.push('end_actual = @end_actual');
            request.input('end_actual', sql.DateTime, end_actual ? new Date(end_actual) : null);
        }
        if (status_id !== undefined) {
            updates.push('status_id = @status_id');
            request.input('status_id', sql.Int, status_id);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        updateQuery += updates.join(', ') + ' WHERE task_id = @task_id';
        await request.query(updateQuery);

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
        const existing = await pool.request()
            .input('task_id', sql.Int, req.params.id)
            .query('SELECT task_id FROM Task WHERE task_id = @task_id');

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        // If user is Исполнитель, check if they are assigned
        if (req.user.role === 'Исполнитель') {
            const assignment = await pool.request()
                .input('task_id', sql.Int, req.params.id)
                .input('employee_id', sql.Int, req.user.employee_id)
                .query('SELECT assignment_id FROM Assignment WHERE task_id = @task_id AND employee_id = @employee_id');

            if (assignment.recordset.length === 0) {
                return res.status(403).json({ error: 'Доступ запрещён' });
            }
        }

        // Check if status exists
        const status = await pool.request()
            .input('status_id', sql.Int, status_id)
            .query('SELECT status_id, name FROM Status WHERE status_id = @status_id');

        if (status.recordset.length === 0) {
            return res.status(404).json({ error: 'Статус не найден' });
        }

        // Update status and set actual dates if needed
        const statusName = status.recordset[0].name;
        let updateQuery = 'UPDATE Task SET status_id = @status_id';

        if (statusName === 'В работе') {
            updateQuery += ', start_actual = ISNULL(start_actual, GETDATE())';
        } else if (statusName === 'Завершена') {
            updateQuery += ', end_actual = GETDATE()';
        }

        updateQuery += ' WHERE task_id = @task_id';

        await pool.request()
            .input('task_id', sql.Int, req.params.id)
            .input('status_id', sql.Int, status_id)
            .query(updateQuery);

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
        await pool.request()
            .input('task_id', sql.Int, req.params.id)
            .query(`DELETE FROM Time_entry WHERE assignment_id IN (SELECT assignment_id FROM Assignment WHERE task_id = @task_id)`);

        await pool.request()
            .input('task_id', sql.Int, req.params.id)
            .query('DELETE FROM Assignment WHERE task_id = @task_id');

        const result = await pool.request()
            .input('task_id', sql.Int, req.params.id)
            .query('DELETE FROM Task WHERE task_id = @task_id');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        res.json({ message: 'Задача удалена' });
    } catch (err) {
        console.error('Delete task error:', err);
        res.status(500).json({ error: 'Ошибка удаления задачи' });
    }
});

module.exports = router;
