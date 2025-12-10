const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ksup-secret-key-2024';

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Недействительный токен' });
        }
        req.user = user;
        next();
    });
}

// Middleware to check if user has required role
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }

        next();
    };
}

// Middleware for managers only (Руководитель or PM)
function requireManager(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    if (!['Руководитель', 'PM'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Доступ запрещён. Требуется роль Руководителя или PM' });
    }

    next();
}

// Middleware for admin only (Руководитель)
function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    if (req.user.role !== 'Руководитель') {
        return res.status(403).json({ error: 'Доступ запрещён. Требуется роль Руководителя' });
    }

    next();
}

module.exports = {
    JWT_SECRET,
    authenticateToken,
    requireRole,
    requireManager,
    requireAdmin
};
