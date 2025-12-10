const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getPool } = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

// Get all employees (with search and filter)
router.get('/', authenticateToken, requireManager, async (req, res) => {
    try {
        const { search, active, role } = req.query;
        const pool = await getPool();

        let query = 'SELECT employee_id, fio, email, phone, hire_date, active, role FROM Employee WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (fio ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (active !== undefined) {
            query += ` AND active = $${paramIndex}`;
            params.push(active === 'true');
            paramIndex++;
        }

        if (role) {
            query += ` AND role = $${paramIndex}`;
            params.push(role);
            paramIndex++;
        }

        query += ' ORDER BY fio';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Get employees error:', err);
        res.status(500).json({ error: 'Ошибка получения списка сотрудников' });
    }
});

// Get employee by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.query(
            'SELECT employee_id, fio, email, phone, hire_date, active, role FROM Employee WHERE employee_id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Get employee error:', err);
        res.status(500).json({ error: 'Ошибка получения данных сотрудника' });
    }
});

// Create employee
router.post('/', authenticateToken, requireManager, [
    body('fio').trim().notEmpty().withMessage('ФИО обязательно для заполнения'),
    body('email').isEmail().withMessage('Введите корректный email'),
    body('phone').matches(/^\d{11}$/).withMessage('Телефон должен содержать 11 цифр'),
    body('role').isIn(['Руководитель', 'PM', 'Исполнитель']).withMessage('Некорректная роль'),
    body('password').isLength({ min: 6 }).withMessage('Пароль должен содержать минимум 6 символов')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { fio, email, phone, role, password } = req.body;
        const pool = await getPool();

        // Check if email already exists
        const existingUser = await pool.query(
            'SELECT employee_id FROM Employee WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO Employee (fio, email, phone, hire_date, active, role, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING employee_id`,
            [fio, email, phone, new Date(), true, role, passwordHash]
        );

        res.status(201).json({
            message: 'Сотрудник успешно создан',
            employee_id: result.rows[0].employee_id
        });
    } catch (err) {
        console.error('Create employee error:', err);
        res.status(500).json({ error: 'Ошибка создания сотрудника' });
    }
});

// Update employee
router.put('/:id', authenticateToken, requireManager, [
    body('fio').optional().trim().notEmpty().withMessage('ФИО не может быть пустым'),
    body('email').optional().isEmail().withMessage('Введите корректный email'),
    body('phone').optional().matches(/^\d{11}$/).withMessage('Телефон должен содержать 11 цифр'),
    body('role').optional().isIn(['Руководитель', 'PM', 'Исполнитель']).withMessage('Некорректная роль')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { fio, email, phone, role } = req.body;
        const pool = await getPool();

        // Check if employee exists
        const existing = await pool.query(
            'SELECT employee_id FROM Employee WHERE employee_id = $1',
            [req.params.id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден' });
        }

        // Check if email is taken by another user
        if (email) {
            const emailCheck = await pool.query(
                'SELECT employee_id FROM Employee WHERE email = $1 AND employee_id != $2',
                [email, req.params.id]
            );

            if (emailCheck.rows.length > 0) {
                return res.status(400).json({ error: 'Email уже используется другим пользователем' });
            }
        }

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (fio) {
            updates.push(`fio = $${paramIndex}`);
            params.push(fio);
            paramIndex++;
        }
        if (email) {
            updates.push(`email = $${paramIndex}`);
            params.push(email);
            paramIndex++;
        }
        if (phone) {
            updates.push(`phone = $${paramIndex}`);
            params.push(phone);
            paramIndex++;
        }
        if (role) {
            updates.push(`role = $${paramIndex}`);
            params.push(role);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        params.push(req.params.id);
        const updateQuery = `UPDATE Employee SET ${updates.join(', ')} WHERE employee_id = $${paramIndex}`;
        await pool.query(updateQuery, params);

        res.json({ message: 'Данные сотрудника обновлены' });
    } catch (err) {
        console.error('Update employee error:', err);
        res.status(500).json({ error: 'Ошибка обновления данных сотрудника' });
    }
});

// Deactivate employee
router.patch('/:id/deactivate', authenticateToken, requireManager, async (req, res) => {
    try {
        const pool = await getPool();

        const result = await pool.query(
            'UPDATE Employee SET active = FALSE WHERE employee_id = $1',
            [req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден' });
        }

        res.json({ message: 'Сотрудник деактивирован' });
    } catch (err) {
        console.error('Deactivate employee error:', err);
        res.status(500).json({ error: 'Ошибка деактивации сотрудника' });
    }
});

// Activate employee
router.patch('/:id/activate', authenticateToken, requireManager, async (req, res) => {
    try {
        const pool = await getPool();

        const result = await pool.query(
            'UPDATE Employee SET active = TRUE WHERE employee_id = $1',
            [req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден' });
        }

        res.json({ message: 'Сотрудник активирован' });
    } catch (err) {
        console.error('Activate employee error:', err);
        res.status(500).json({ error: 'Ошибка активации сотрудника' });
    }
});

module.exports = router;
