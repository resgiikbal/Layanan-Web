const express = require('express');
const router = express.Router();
const db = require("../config/database");
const upload = require('../middleware/upload');
const fs = require('fs').promises;
const path = require('path');

// Buat direktori uploads jika belum ada
const uploadDir = path.join(__dirname, "../uploads/products");

(async () => {
    try {
        await fs.mkdir(uploadDir, { recursive: true });
    } catch (error) {
        console.error("Error creating upload directory:", error);
    }
})();

// Layani file gambar statis
router.use('/images', express.static('uploads/products'));

// Get all products dengan pagination dan filtering
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const category = req.query.category;
        const search = req.query.search;

        let query = `
            SELECT p.*, c.name as category_name,
                   GROUP_CONCAT(pi.filename) as images
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_images pi ON p.id = pi.product_id
        `;

        let countQuery = 'SELECT COUNT(DISTINCT p.id) as total FROM products p';
        let queryParams = [];
        let countParams = [];

        if (category || search) {
            query += " WHERE";
            countQuery += " WHERE";

            let conditions = [];

            if (category) {
                conditions.push(" p.category_id = ?");
                queryParams.push(category);
                countParams.push(category);
            }

            if (search) {
                conditions.push(" p.name LIKE ?");
                queryParams.push(`%${search}%`);
                countParams.push(`%${search}%`);
            }

            query += conditions.join(" AND ");
            countQuery += conditions.join(" AND ");
        }

        query += " GROUP BY p.id LIMIT ? OFFSET ?";
        queryParams.push(limit, offset);

        const [products] = await db.query(query, queryParams);
        const [totalRows] = await db.query(countQuery, countParams);

        const totalPages = Math.ceil(totalRows[0]?.total / limit);

        res.json({
            products,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: totalRows[0]?.total || 0,
                itemsPerPage: limit,
            }
        });

    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// Get product by ID
router.get("/:id", async (req, res) => {
    try {
        const [product] = await db.query(
            `SELECT p.*, c.name as category_name,
            GROUP_CONCAT(pi.filename) as images
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_images pi ON p.id = pi.product_id
            WHERE p.id = ?
            GROUP BY p.id`,
            [req.params.id]
        );

        if (product.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json(product[0]);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ message: "Error fetching product" });
    }
});

module.exports = router;
