const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Register new user
router.post('/register', async (req, res) => {
    const { email, password, first_name, last_name } = req.body;
    
    try {
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        // Check if user already exists
        const [existingUser] = await db.query("SELECT id FROM users WHERE email = ?", [email]);

        if (existingUser.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create User
        const [result] = await db.query(
            "INSERT INTO users (email, password, first_name, last_name) VALUES (?, ?, ?, ?)",
            [email, hashedPassword, first_name, last_name]
        );

        // Generate JWT token
        const token = jwt.sign(
            { id: result.insertId, email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.status(201).json({
            token,
            user: {
                id: result.insertId,
                email,
                first_name,
                last_name,
            }
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ message: "Error registering user" });
    }
});

// Login User
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: "Please provide email and password" });
        }

        // Check if user exists
        const [users] = await db.query(
            "SELECT id, email, password, first_name, last_name, role FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const user = users[0];

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        return res.json({
            token,
            user: userWithoutPassword
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ message: "Error logging in" });
    }
});

module.exports = router;
