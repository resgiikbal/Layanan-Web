const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

// CREATE NEW ORDER (HITUNG TOTAL OTOMATIS)
router.post('/', authMiddleware, async (req, res) => {
  const { items, shippingDetails } = req.body;
  const userId = req.user.id;

  try {
    await db.query('START TRANSACTION');

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      // Ambil harga produk dari database
      const [rows] = await db.query('SELECT price FROM products WHERE id = ?', [item.id]);

      if (!rows.length) {
        throw new Error(`Produk dengan ID ${item.id} tidak ditemukan`);
      }

      const price = rows[0].price;
      const subtotal = price * item.quantity;
      totalAmount += subtotal;

      orderItems.push([null, item.id, item.quantity, price]); // orderId nanti ditambahkan
    }

    // Simpan order
    const [orderResult] = await db.query(
      `INSERT INTO orders 
        (user_id, total_amount, status, shipping_address, shipping_city, shipping_postal_code, shipping_phone) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        totalAmount,
        'Tertunda',
        shippingDetails.address,
        shippingDetails.city,
        shippingDetails.postalCode,
        shippingDetails.phone
      ]
    );

    const orderId = orderResult.insertId;

    // Masukkan order_items dengan orderId yang baru
    const finalOrderItems = orderItems.map(item => {
      item[0] = orderId;
      return item;
    });

    await db.query(
      'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ?',
      [finalOrderItems]
    );

    // Update stok produk
    for (const item of items) {
      await db.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.id]
      );
    }

    await db.query('COMMIT');

    res.status(201).json({
      message: 'Order created successfully',
      orderId,
      totalAmount
    });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error creating order:', error.message);
    res.status(500).json({ message: 'Error creating order', detail: error.message });
  }
});

// GET USER'S ORDERS
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
    console.error('Error fetching orders:', error.message);
    res.status(500).json({ message: 'Error fetching orders' });
  }
});

module.exports = router;
