const jwt = require('jsonwebtoken');
const db = require('../config/database');

const adminAuth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Cek apakah user ada dan memiliki peran admin
        const [user] = await db.query(
            'SELECT * FROM users WHERE id = ? AND role = "admin"',
            [decoded.id]
        );

        if (user.length === 0) {
            throw new Error();
        }

        req.user = user[0];
        next();
    } catch (error) {
        res.status(401).json({ message: 'Not authorized as admin' });
    }
};

module.exports = adminAuth;
