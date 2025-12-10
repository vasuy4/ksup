const express = require('express');
const router = express.Router();
const { getPool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get all statuses
router.get('/', authenticateToken, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT * FROM Status ORDER BY status_id');

        res.json(result.recordset);
    } catch (err) {
        console.error('Get statuses error:', err);
        res.status(500).json({ error: 'Ошибка получения списка статусов' });
    }
});

module.exports = router;
