const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Create new order
router.post('/', authMiddleware, async (req, res) => {
    const { items, totalAmount, shippingDetails } = req.body;
    const userId = req.user.id;

    try {
        // Start transaction
        await db.query('START TRANSACTION');

        // Create order
        const [orderResult] = await db.query(
            `INSERT INTO orders 
            (user_id, total_amount, status, shipping_address, shipping_city, shipping_postal_code, shipping_phone) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                totalAmount,
                'pending',
                shippingDetails.address,
                shippingDetails.city,
                shippingDetails.postalCode,
                shippingDetails.phone
            ]
        );

        const orderId = orderResult.insertId;

        // Insert order items
        const orderItems = items.map(item => [orderId, item.id, item.quantity, item.price]);

        await db.query(
            'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ?',
            [orderItems]
        );

        // Update product stock
        for (const item of items) {
            await db.query(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                [item.quantity, item.id]
            );
        }

        // Commit transaction
        await db.query('COMMIT');

        res.status(201).json({
            message: 'Order created successfully',
            orderId
        });
    } catch (error) {
        // Rollback transaction on error
        await db.query('ROLLBACK');
        console.error('Error:', error);
        res.status(500).json({ message: 'Error creating order' });
    }
});

// Get user's orders
router.get('/my-orders', authMiddleware, async (req, res) => {
    try {
        const [orders] = await db.query(`
            SELECT 
                o.*,
                COUNT(oi.id) AS total_items,
                GROUP_CONCAT(p.name) AS product_names,
                GROUP_CONCAT(c.name) AS product_categories
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE o.user_id = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `, [req.user.id]);

        res.json(orders);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Error fetching orders' });
    }
});


module.exports = router;
