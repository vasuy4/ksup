const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getPool, sql } = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

// Get all projects (with filter)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { is_archived, search, priority } = req.query;
        const pool = await getPool();

        let query = `SELECT p.*,
            (SELECT COUNT(*) FROM Task t WHERE t.project_id = p.project_id) as task_count,
            (SELECT COUNT(*) FROM Task t WHERE t.project_id = p.project_id AND t.status_id = (SELECT status_id FROM Status WHERE name = 'Завершена')) as completed_tasks
            FROM Project p WHERE 1=1`;
        const request = pool.request();

        if (is_archived !== undefined) {
            query += ' AND p.is_archived = @is_archived';
            request.input('is_archived', sql.Bit, is_archived === 'true' ? 1 : 0);
        }

        if (search) {
            query += ' AND (p.name LIKE @search OR p.description LIKE @search)';
            request.input('search', sql.VarChar, `%${search}%`);
        }

        if (priority) {
            query += ' AND p.priority = @priority';
            request.input('priority', sql.Int, parseInt(priority));
        }

        query += ' ORDER BY p.priority DESC, p.start_plan';

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get projects error:', err);
        res.status(500).json({ error: 'Ошибка получения списка проектов' });
    }
});

// Get project by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('project_id', sql.Int, req.params.id)
            .query(`SELECT p.*,
                (SELECT COUNT(*) FROM Task t WHERE t.project_id = p.project_id) as task_count,
                (SELECT COUNT(*) FROM Task t WHERE t.project_id = p.project_id AND t.status_id = (SELECT status_id FROM Status WHERE name = 'Завершена')) as completed_tasks
                FROM Project p WHERE p.project_id = @project_id`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Get project error:', err);
        res.status(500).json({ error: 'Ошибка получения данных проекта' });
    }
});

// Create project
router.post('/', authenticateToken, requireManager, [
    body('name').trim().notEmpty().withMessage('Название проекта обязательно'),
    body('description').optional().isString(),
    body('budget_plan').isNumeric().withMessage('Бюджет должен быть числом'),
    body('start_plan').isISO8601().withMessage('Некорректная дата начала'),
    body('end_plan').isISO8601().withMessage('Некорректная дата окончания'),
    body('priority').isInt({ min: 1, max: 5 }).withMessage('Приоритет должен быть от 1 до 5')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, description, budget_plan, start_plan, end_plan, priority } = req.body;
        const pool = await getPool();

        // Validate dates
        if (new Date(end_plan) <= new Date(start_plan)) {
            return res.status(400).json({ error: 'Дата окончания должна быть позже даты начала' });
        }

        // Get next ID
        const maxIdResult = await pool.request()
            .query('SELECT ISNULL(MAX(project_id), 0) + 1 as next_id FROM Project');
        const nextId = maxIdResult.recordset[0].next_id;

        await pool.request()
            .input('project_id', sql.Int, nextId)
            .input('name', sql.VarChar, name)
            .input('description', sql.VarChar, description || '')
            .input('budget_plan', sql.Decimal, budget_plan)
            .input('budget_fact', sql.Decimal, 0)
            .input('start_plan', sql.DateTime, new Date(start_plan))
            .input('end_plan', sql.DateTime, new Date(end_plan))
            .input('priority', sql.Int, priority)
            .input('is_archived', sql.Bit, 0)
            .query(`INSERT INTO Project (project_id, name, description, budget_plan, budget_fact, start_plan, end_plan, priority, is_archived)
                    VALUES (@project_id, @name, @description, @budget_plan, @budget_fact, @start_plan, @end_plan, @priority, @is_archived)`);

        res.status(201).json({
            message: 'Проект успешно создан',
            project_id: nextId
        });
    } catch (err) {
        console.error('Create project error:', err);
        res.status(500).json({ error: 'Ошибка создания проекта' });
    }
});

// Update project
router.put('/:id', authenticateToken, requireManager, [
    body('name').optional().trim().notEmpty().withMessage('Название не может быть пустым'),
    body('budget_plan').optional().isNumeric().withMessage('Бюджет должен быть числом'),
    body('budget_fact').optional().isNumeric().withMessage('Фактический бюджет должен быть числом'),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('Приоритет должен быть от 1 до 5')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const pool = await getPool();

        // Check if project exists
        const existing = await pool.request()
            .input('project_id', sql.Int, req.params.id)
            .query('SELECT project_id, is_archived FROM Project WHERE project_id = @project_id');

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        if (existing.recordset[0].is_archived) {
            return res.status(400).json({ error: 'Нельзя редактировать архивный проект' });
        }

        const { name, description, budget_plan, budget_fact, start_plan, end_plan, start_actual, end_actual, priority } = req.body;

        let updateQuery = 'UPDATE Project SET ';
        const updates = [];
        const request = pool.request();
        request.input('project_id', sql.Int, req.params.id);

        if (name !== undefined) {
            updates.push('name = @name');
            request.input('name', sql.VarChar, name);
        }
        if (description !== undefined) {
            updates.push('description = @description');
            request.input('description', sql.VarChar, description);
        }
        if (budget_plan !== undefined) {
            updates.push('budget_plan = @budget_plan');
            request.input('budget_plan', sql.Decimal, budget_plan);
        }
        if (budget_fact !== undefined) {
            updates.push('budget_fact = @budget_fact');
            request.input('budget_fact', sql.Decimal, budget_fact);
        }
        if (start_plan !== undefined) {
            updates.push('start_plan = @start_plan');
            request.input('start_plan', sql.DateTime, new Date(start_plan));
        }
        if (end_plan !== undefined) {
            updates.push('end_plan = @end_plan');
            request.input('end_plan', sql.DateTime, new Date(end_plan));
        }
        if (start_actual !== undefined) {
            updates.push('start_actual = @start_actual');
            request.input('start_actual', sql.DateTime, start_actual ? new Date(start_actual) : null);
        }
        if (end_actual !== undefined) {
            updates.push('end_actual = @end_actual');
            request.input('end_actual', sql.DateTime, end_actual ? new Date(end_actual) : null);
        }
        if (priority !== undefined) {
            updates.push('priority = @priority');
            request.input('priority', sql.Int, priority);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        updateQuery += updates.join(', ') + ' WHERE project_id = @project_id';
        await request.query(updateQuery);

        res.json({ message: 'Проект обновлён' });
    } catch (err) {
        console.error('Update project error:', err);
        res.status(500).json({ error: 'Ошибка обновления проекта' });
    }
});

// Archive project
router.patch('/:id/archive', authenticateToken, requireManager, async (req, res) => {
    try {
        const pool = await getPool();

        // Check for active tasks
        const activeTasks = await pool.request()
            .input('project_id', sql.Int, req.params.id)
            .query(`SELECT COUNT(*) as count FROM Task t
                    JOIN Status s ON t.status_id = s.status_id
                    WHERE t.project_id = @project_id AND s.name NOT IN ('Завершена', 'Отменена')`);

        if (activeTasks.recordset[0].count > 0) {
            return res.status(400).json({ error: 'Нельзя архивировать проект с активными задачами' });
        }

        const result = await pool.request()
            .input('project_id', sql.Int, req.params.id)
            .query('UPDATE Project SET is_archived = 1 WHERE project_id = @project_id');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        res.json({ message: 'Проект архивирован' });
    } catch (err) {
        console.error('Archive project error:', err);
        res.status(500).json({ error: 'Ошибка архивации проекта' });
    }
});

// Unarchive project
router.patch('/:id/unarchive', authenticateToken, requireManager, async (req, res) => {
    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('project_id', sql.Int, req.params.id)
            .query('UPDATE Project SET is_archived = 0 WHERE project_id = @project_id');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        res.json({ message: 'Проект разархивирован' });
    } catch (err) {
        console.error('Unarchive project error:', err);
        res.status(500).json({ error: 'Ошибка разархивации проекта' });
    }
});

// Delete project (only if no tasks)
router.delete('/:id', authenticateToken, requireManager, async (req, res) => {
    try {
        const pool = await getPool();

        // Check for tasks
        const tasks = await pool.request()
            .input('project_id', sql.Int, req.params.id)
            .query('SELECT COUNT(*) as count FROM Task WHERE project_id = @project_id');

        if (tasks.recordset[0].count > 0) {
            return res.status(400).json({ error: 'Нельзя удалить проект с привязанными задачами' });
        }

        const result = await pool.request()
            .input('project_id', sql.Int, req.params.id)
            .query('DELETE FROM Project WHERE project_id = @project_id');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        res.json({ message: 'Проект удалён' });
    } catch (err) {
        console.error('Delete project error:', err);
        res.status(500).json({ error: 'Ошибка удаления проекта' });
    }
});

// Get project statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('project_id', sql.Int, req.params.id)
            .query(`
                SELECT
                    p.*,
                    (SELECT COUNT(*) FROM Task WHERE project_id = @project_id) as total_tasks,
                    (SELECT COUNT(*) FROM Task t JOIN Status s ON t.status_id = s.status_id WHERE t.project_id = @project_id AND s.name = 'Создана') as new_tasks,
                    (SELECT COUNT(*) FROM Task t JOIN Status s ON t.status_id = s.status_id WHERE t.project_id = @project_id AND s.name = 'В работе') as in_progress_tasks,
                    (SELECT COUNT(*) FROM Task t JOIN Status s ON t.status_id = s.status_id WHERE t.project_id = @project_id AND s.name = 'На проверке') as review_tasks,
                    (SELECT COUNT(*) FROM Task t JOIN Status s ON t.status_id = s.status_id WHERE t.project_id = @project_id AND s.name = 'Завершена') as completed_tasks,
                    (SELECT ISNULL(SUM(t.effort_plan), 0) FROM Task t WHERE t.project_id = @project_id) as effort_plan_total,
                    (SELECT ISNULL(SUM(te.hours), 0) FROM Time_entry te
                        JOIN Assignment a ON te.assignment_id = a.assignment_id
                        JOIN Task t ON a.task_id = t.task_id
                        WHERE t.project_id = @project_id) as effort_fact_total
                FROM Project p
                WHERE p.project_id = @project_id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Get project stats error:', err);
        res.status(500).json({ error: 'Ошибка получения статистики проекта' });
    }
});

module.exports = router;
