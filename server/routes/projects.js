const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getPool } = require('../config/database');
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
        const params = [];
        let paramIndex = 1;

        if (is_archived !== undefined) {
            query += ` AND p.is_archived = $${paramIndex}`;
            params.push(is_archived === 'true');
            paramIndex++;
        }

        if (search) {
            query += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (priority) {
            query += ` AND p.priority = $${paramIndex}`;
            params.push(parseInt(priority));
            paramIndex++;
        }

        query += ' ORDER BY p.priority DESC, p.start_plan';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Get projects error:', err);
        res.status(500).json({ error: 'Ошибка получения списка проектов' });
    }
});

// Get project by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.query(
            `SELECT p.*,
                (SELECT COUNT(*) FROM Task t WHERE t.project_id = p.project_id) as task_count,
                (SELECT COUNT(*) FROM Task t WHERE t.project_id = p.project_id AND t.status_id = (SELECT status_id FROM Status WHERE name = 'Завершена')) as completed_tasks
                FROM Project p WHERE p.project_id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        res.json(result.rows[0]);
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

        const result = await pool.query(
            `INSERT INTO Project (name, description, budget_plan, budget_fact, start_plan, end_plan, priority, is_archived)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING project_id`,
            [name, description || '', budget_plan, 0, new Date(start_plan), new Date(end_plan), priority, false]
        );

        res.status(201).json({
            message: 'Проект успешно создан',
            project_id: result.rows[0].project_id
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
        const existing = await pool.query(
            'SELECT project_id, is_archived FROM Project WHERE project_id = $1',
            [req.params.id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        if (existing.rows[0].is_archived) {
            return res.status(400).json({ error: 'Нельзя редактировать архивный проект' });
        }

        const { name, description, budget_plan, budget_fact, start_plan, end_plan, start_actual, end_actual, priority } = req.body;

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramIndex}`);
            params.push(name);
            paramIndex++;
        }
        if (description !== undefined) {
            updates.push(`description = $${paramIndex}`);
            params.push(description);
            paramIndex++;
        }
        if (budget_plan !== undefined) {
            updates.push(`budget_plan = $${paramIndex}`);
            params.push(budget_plan);
            paramIndex++;
        }
        if (budget_fact !== undefined) {
            updates.push(`budget_fact = $${paramIndex}`);
            params.push(budget_fact);
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
        if (priority !== undefined) {
            updates.push(`priority = $${paramIndex}`);
            params.push(priority);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        params.push(req.params.id);
        const updateQuery = `UPDATE Project SET ${updates.join(', ')} WHERE project_id = $${paramIndex}`;
        await pool.query(updateQuery, params);

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
        const activeTasks = await pool.query(
            `SELECT COUNT(*) as count FROM Task t
             JOIN Status s ON t.status_id = s.status_id
             WHERE t.project_id = $1 AND s.name NOT IN ('Завершена', 'Отменена')`,
            [req.params.id]
        );

        if (parseInt(activeTasks.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Нельзя архивировать проект с активными задачами' });
        }

        const result = await pool.query(
            'UPDATE Project SET is_archived = TRUE WHERE project_id = $1',
            [req.params.id]
        );

        if (result.rowCount === 0) {
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

        const result = await pool.query(
            'UPDATE Project SET is_archived = FALSE WHERE project_id = $1',
            [req.params.id]
        );

        if (result.rowCount === 0) {
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
        const tasks = await pool.query(
            'SELECT COUNT(*) as count FROM Task WHERE project_id = $1',
            [req.params.id]
        );

        if (parseInt(tasks.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Нельзя удалить проект с привязанными задачами' });
        }

        const result = await pool.query(
            'DELETE FROM Project WHERE project_id = $1',
            [req.params.id]
        );

        if (result.rowCount === 0) {
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

        const result = await pool.query(
            `SELECT
                p.*,
                (SELECT COUNT(*) FROM Task WHERE project_id = $1) as total_tasks,
                (SELECT COUNT(*) FROM Task t JOIN Status s ON t.status_id = s.status_id WHERE t.project_id = $1 AND s.name = 'Создана') as new_tasks,
                (SELECT COUNT(*) FROM Task t JOIN Status s ON t.status_id = s.status_id WHERE t.project_id = $1 AND s.name = 'В работе') as in_progress_tasks,
                (SELECT COUNT(*) FROM Task t JOIN Status s ON t.status_id = s.status_id WHERE t.project_id = $1 AND s.name = 'На проверке') as review_tasks,
                (SELECT COUNT(*) FROM Task t JOIN Status s ON t.status_id = s.status_id WHERE t.project_id = $1 AND s.name = 'Завершена') as completed_tasks,
                (SELECT COALESCE(SUM(t.effort_plan), 0) FROM Task t WHERE t.project_id = $1) as effort_plan_total,
                (SELECT COALESCE(SUM(te.hours), 0) FROM Time_entry te
                    JOIN Assignment a ON te.assignment_id = a.assignment_id
                    JOIN Task t ON a.task_id = t.task_id
                    WHERE t.project_id = $1) as effort_fact_total
            FROM Project p
            WHERE p.project_id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Get project stats error:', err);
        res.status(500).json({ error: 'Ошибка получения статистики проекта' });
    }
});

module.exports = router;
