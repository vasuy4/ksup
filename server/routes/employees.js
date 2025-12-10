const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getPool, sql } = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

// Get all employees (with search and filter)
router.get('/', authenticateToken, requireManager, async (req, res) => {
    try {
        const { search, active, role } = req.query;
        const pool = await getPool();

        let query = 'SELECT employee_id, fio, email, phone, hire_date, active, role FROM Employee WHERE 1=1';
        const request = pool.request();

        if (search) {
            query += ' AND (fio LIKE @search OR email LIKE @search)';
            request.input('search', sql.VarChar, `%${search}%`);
        }

        if (active !== undefined) {
            query += ' AND active = @active';
            request.input('active', sql.Bit, active === 'true' ? 1 : 0);
        }

        if (role) {
            query += ' AND role = @role';
            request.input('role', sql.VarChar, role);
        }

        query += ' ORDER BY fio';

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get employees error:', err);
        res.status(500).json({ error: 'Ошибка получения списка сотрудников' });
    }
});

// Get employee by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('employee_id', sql.Int, req.params.id)
            .query('SELECT employee_id, fio, email, phone, hire_date, active, role FROM Employee WHERE employee_id = @employee_id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден' });
        }

        res.json(result.recordset[0]);
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
        const existingUser = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT employee_id FROM Employee WHERE email = @email');

        if (existingUser.recordset.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }

        // Get next ID
        const maxIdResult = await pool.request()
            .query('SELECT ISNULL(MAX(employee_id), 0) + 1 as next_id FROM Employee');
        const nextId = maxIdResult.recordset[0].next_id;

        const passwordHash = await bcrypt.hash(password, 10);

        await pool.request()
            .input('employee_id', sql.Int, nextId)
            .input('fio', sql.VarChar, fio)
            .input('email', sql.VarChar, email)
            .input('phone', sql.VarChar, phone)
            .input('hire_date', sql.DateTime, new Date())
            .input('active', sql.Bit, 1)
            .input('role', sql.VarChar, role)
            .input('password_hash', sql.VarChar, passwordHash)
            .query(`INSERT INTO Employee (employee_id, fio, email, phone, hire_date, active, role, password_hash)
                    VALUES (@employee_id, @fio, @email, @phone, @hire_date, @active, @role, @password_hash)`);

        res.status(201).json({
            message: 'Сотрудник успешно создан',
            employee_id: nextId
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
        const existing = await pool.request()
            .input('employee_id', sql.Int, req.params.id)
            .query('SELECT employee_id FROM Employee WHERE employee_id = @employee_id');

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден' });
        }

        // Check if email is taken by another user
        if (email) {
            const emailCheck = await pool.request()
                .input('email', sql.VarChar, email)
                .input('employee_id', sql.Int, req.params.id)
                .query('SELECT employee_id FROM Employee WHERE email = @email AND employee_id != @employee_id');

            if (emailCheck.recordset.length > 0) {
                return res.status(400).json({ error: 'Email уже используется другим пользователем' });
            }
        }

        let updateQuery = 'UPDATE Employee SET ';
        const updates = [];
        const request = pool.request();
        request.input('employee_id', sql.Int, req.params.id);

        if (fio) {
            updates.push('fio = @fio');
            request.input('fio', sql.VarChar, fio);
        }
        if (email) {
            updates.push('email = @email');
            request.input('email', sql.VarChar, email);
        }
        if (phone) {
            updates.push('phone = @phone');
            request.input('phone', sql.VarChar, phone);
        }
        if (role) {
            updates.push('role = @role');
            request.input('role', sql.VarChar, role);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        updateQuery += updates.join(', ') + ' WHERE employee_id = @employee_id';
        await request.query(updateQuery);

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

        const result = await pool.request()
            .input('employee_id', sql.Int, req.params.id)
            .query('UPDATE Employee SET active = 0 WHERE employee_id = @employee_id');

        if (result.rowsAffected[0] === 0) {
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

        const result = await pool.request()
            .input('employee_id', sql.Int, req.params.id)
            .query('UPDATE Employee SET active = 1 WHERE employee_id = @employee_id');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден' });
        }

        res.json({ message: 'Сотрудник активирован' });
    } catch (err) {
        console.error('Activate employee error:', err);
        res.status(500).json({ error: 'Ошибка активации сотрудника' });
    }
});

module.exports = router;
