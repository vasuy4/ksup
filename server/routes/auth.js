const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getPool } = require('../config/database');
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

        const result = await pool.query(
            'SELECT * FROM Employee WHERE email = $1 AND active = TRUE',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        const user = result.rows[0];
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
        const result = await pool.query(
            'SELECT employee_id, fio, email, phone, hire_date, role FROM Employee WHERE employee_id = $1',
            [req.user.employee_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json(result.rows[0]);
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

        const result = await pool.query(
            'SELECT password_hash FROM Employee WHERE employee_id = $1',
            [req.user.employee_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const isValidPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверный текущий пароль' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.query(
            'UPDATE Employee SET password_hash = $1 WHERE employee_id = $2',
            [newHash, req.user.employee_id]
        );

        res.json({ message: 'Пароль успешно изменён' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Ошибка смены пароля' });
    }
});

module.exports = router;
