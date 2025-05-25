const express = require('express');
const router = express.Router(); // Perbaikan kapitalisasi "Router"
const db = require('../config/database');

// Get all categories
router.get('/', async (req, res) => { // Perbaikan nama parameter
    try { // Perbaikan struktur try...catch
        const [categories] = await db.query(`
            SELECT c.*, COUNT(p.id) AS product_count
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id
            GROUP BY c.id
        `);
        res.json(categories);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Error fetching categories' });
    }
});

module.exports = router; // Ekspor diperbaiki
