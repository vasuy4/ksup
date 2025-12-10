const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getPool, sql } = require('../config/database');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

// Login
router.post('/login', [
    body('email').isEmail().withMessage('Введите корректный email'),
    body('password').notEmpty().withMessage('Введите пароль')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;
        const pool = await getPool();

        const result = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT * FROM Employee WHERE email = @email AND active = 1');

        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const user = result.recordset[0];
        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const token = jwt.sign(
            {
                employee_id: user.employee_id,
                email: user.email,
                fio: user.fio,
                role: user.role
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                employee_id: user.employee_id,
                email: user.email,
                fio: user.fio,
                role: user.role,
                phone: user.phone
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Ошибка авторизации' });
    }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('employee_id', sql.Int, req.user.employee_id)
            .query('SELECT employee_id, fio, email, phone, hire_date, role FROM Employee WHERE employee_id = @employee_id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: 'Ошибка получения данных пользователя' });
    }
});

// Change password
router.post('/change-password', authenticateToken, [
    body('currentPassword').notEmpty().withMessage('Введите текущий пароль'),
    body('newPassword').isLength({ min: 6 }).withMessage('Новый пароль должен содержать минимум 6 символов')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { currentPassword, newPassword } = req.body;
        const pool = await getPool();

        const result = await pool.request()
            .input('employee_id', sql.Int, req.user.employee_id)
            .query('SELECT password_hash FROM Employee WHERE employee_id = @employee_id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const isValidPassword = await bcrypt.compare(currentPassword, result.recordset[0].password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверный текущий пароль' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.request()
            .input('employee_id', sql.Int, req.user.employee_id)
            .input('password_hash', sql.VarChar, newHash)
            .query('UPDATE Employee SET password_hash = @password_hash WHERE employee_id = @employee_id');

        res.json({ message: 'Пароль успешно изменён' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Ошибка смены пароля' });
    }
});

module.exports = router;
