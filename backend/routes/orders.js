const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Konfigurasi multer untuk upload file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/payment-proofs/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'payment-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Hanya file gambar (jpg, jpeg, png) yang diperbolehkan!'));
  }
});

Backend-APIs-for-Admin-Analytics
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
                shippingDetails.postal_code,
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
            SELECT o.*,
                COUNT(oi.id) AS total_items,
                GROUP_CONCAT(p.name) AS product_names
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.user_id = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `, [req.user.id]);

        res.json(orders);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Error fetching orders' });
    }
 dev
});

// Upload bukti pembayaran
router.post('/:orderId/payment-proof', authMiddleware, upload.single('paymentProof'), async (req, res) => {
  const orderId = req.params.orderId;
  const userId = req.user.id;

  try {
    // Cek kepemilikan order
    const [order] = await db.query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    
    if (!order.length) {
      return res.status(404).json({ message: 'Order tidak ditemukan' });
    }

    // Update payment_proof di database
    await db.query('UPDATE orders SET payment_proof = ? WHERE id = ?', [req.file.filename, orderId]);

    res.json({
      message: 'Bukti pembayaran berhasil diunggah',
      payment_proof: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading payment proof:', error);
    res.status(500).json({ message: 'Error uploading payment proof' });
  }
});

// Get payment proof
router.get('/:orderId/payment-proof', authMiddleware, async (req, res) => {
  const orderId = req.params.orderId;
  const userId = req.user.id;

  try {
    const [order] = await db.query('SELECT payment_proof FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    
    if (!order.length) {
      return res.status(404).json({ message: 'Order tidak ditemukan' });
    }

    res.json({ payment_proof: order[0].payment_proof });
  } catch (error) {
    console.error('Error getting payment proof:', error);
    res.status(500).json({ message: 'Error getting payment proof' });
  }
});

module.exports = router;
