const jwt = require ('jsonwebtoken');

const authMiddleware = (req, res, next) => {
Backend-APIs-for-Admin-Analytics
    const token = req.header('Authorization')?.replace('Bearer ', '');

    const token = req.header('Authorization')?.replace('Bearer', '');
 dev

    if (!token){
        return res.status(401).json({message: 'No token, authorization denied'});
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({message: 'Token is not valid'});
    }
    };

module.exports = authMiddleware;