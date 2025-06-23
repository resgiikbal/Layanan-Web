const express = require("express");
const router = express.Router();
const db = require("../config/database");
const adminAuth = require("../middleware/adminAuth");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

// Admin Dashboard Stats
router.get("/stats", adminAuth, async (req, res) => {
    try {
        const [productCount] = await db.query("SELECT COUNT(*) as count FROM products");
        const [userCount] = await db.query("SELECT COUNT(*) as count FROM users");
        const [orderCount] = await db.query("SELECT COUNT(*) as count FROM orders");
      const [totalRevenue] = await db.query(`
  SELECT SUM(total_amount) as total 
  FROM orders 
  WHERE status IN ('Tertunda', 'Diproses', 'Dikirim', 'Terkirim')
`);



        const [orderStats] = await db.query(`
           SELECT 
    COUNT(CASE WHEN status = 'Tertunda' THEN 1 END) AS tertunda,
    COUNT(CASE WHEN status = 'Diproses' THEN 1 END) AS diproses,
    COUNT(CASE WHEN status = 'Dikirim' THEN 1 END) AS dikirim,
    COUNT(CASE WHEN status = 'Terkirim' THEN 1 END) AS terkirim,
    COUNT(CASE WHEN status = 'Dibatalkan' THEN 1 END) AS dibatalkan
FROM orders;

        `);

        res.json({
            products: productCount[0].count,
            users: userCount[0].count,
            orders: orderCount[0].count,
            revenue: totalRevenue[0].total || 0,
            orderStats: orderStats[0],
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Error fetching stats" });
    }
});

// Buat folder upload jika belum ada
const uploadDir = "uploads/products";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfigurasi multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "_" + Math.round(Math.random() * 1e9);
        const filename = uniqueSuffix + path.extname(file.originalname);
        console.log("File disimpan sebagai:", filename);
        cb(null, filename);
    },
});
const upload = multer({ storage: storage });

// GET semua produk
router.get("/products", adminAuth, async (req, res) => {
    try {
        const [products] = await db.query(`
            SELECT p.*, c.name AS category_name,
                GROUP_CONCAT(pi.filename) AS images
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_images pi ON p.id = pi.product_id
            GROUP BY p.id
        `);
        res.json(products);
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Error fetching products" });
    }
});

// POST tambah produk
router.post("/products", adminAuth, upload.array("images", 5), async (req, res) => {
    const { name, description, price, category_id, stock } = req.body;

    try {
        if (!name || !category_id) {
            if (req.files) {
                await Promise.all(req.files.map((file) => fs.promises.unlink(file.path).catch(console.error)));
            }
            return res.status(400).json({ message: "Please provide all required fields" });
        }

        await db.query("START TRANSACTION");

        const [result] = await db.query(
            "INSERT INTO products (name, description, price, category_id, stock) VALUES (?, ?, ?, ?, ?)",
            [name, description, price, category_id, stock]
        );

        if (req.files && req.files.length > 0) {
            const imageValues = req.files.map((file) => [
                result.insertId,
                file.filename,
                path.join(uploadDir, file.filename),
            ]);
            await db.query("INSERT INTO product_images (product_id, filename, filepath) VALUES ?", [imageValues]);
        }

        await db.query("COMMIT");

        const [newProduct] = await db.query(
            `SELECT p.*, c.name AS category_name,
                GROUP_CONCAT(pi.filename) AS images
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_images pi ON p.id = pi.product_id
            WHERE p.id = ?`,
            [result.insertId]
        );

        res.status(201).json(newProduct[0]);
    } catch (error) {
        await db.query("ROLLBACK");
        if (req.files) {
            await Promise.all(req.files.map((file) => fs.promises.unlink(file.path).catch(console.error)));
        }
        console.error("Error:", error);
        res.status(500).json({ message: "Error creating product" });
    }
});

// PUT update produk
router.put("/products/:id", adminAuth, upload.array("images", 5), async (req, res) => {
    const { name, description, price, category_id, stock } = req.body;
    const product_id = req.params.id;

    try {
        await db.query("START TRANSACTION");

        await db.query(
            "UPDATE products SET name = ?, description = ?, price = ?, category_id = ?, stock = ? WHERE id = ?",
            [name, description, price, category_id, stock, product_id]
        );

        if (req.files && req.files.length > 0) {
            const [oldImages] = await db.query("SELECT filepath FROM product_images WHERE product_id = ?", [product_id]);
            for (const image of oldImages) {
                await fs.promises.unlink(image.filepath).catch(console.error);
            }
            await db.query("DELETE FROM product_images WHERE product_id = ?", [product_id]);

            const imageValues = req.files.map((file) => [
                product_id,
                file.filename,
                path.join(uploadDir, file.filename),
            ]);
            await db.query("INSERT INTO product_images (product_id, filename, filepath) VALUES ?", [imageValues]);
        }

        await db.query("COMMIT");

        res.json({ message: "Product updated successfully" });
    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error:", error);
        res.status(500).json({ message: "Error updating product" });
    }
});

// DELETE produk
router.delete("/products/:id", adminAuth, async (req, res) => {
    try {
        await db.query("START TRANSACTION");

        const [images] = await db.query("SELECT filepath FROM product_images WHERE product_id = ?", [req.params.id]);
        for (const image of images) {
            await fs.promises.unlink(image.filepath).catch(console.error);
        }

        await db.query("DELETE FROM product_images WHERE product_id = ?", [req.params.id]);
        await db.query("DELETE FROM products WHERE id = ?", [req.params.id]);

        await db.query("COMMIT");

        res.json({ message: "Product deleted successfully" });
    } catch (error) {
        await db.query("ROLLBACK");
        console.error("Error:", error);
        res.status(500).json({ message: "Error deleting product" });
    }
});

// GET all orders
router.get("/orders", adminAuth, async (req, res) => {
    try {
        const [orders] = await db.query(`
            SELECT o.*, u.email, u.first_name, u.last_name,
                COUNT(oi.id) as item_count,
                GROUP_CONCAT(DISTINCT p.name) as products,
                o.shipping_address, o.shipping_city,
                o.shipping_postal_code, o.shipping_phone,
                o.payment_proof
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `);
        res.json(orders);
    } catch (error) {
        console.error("Error in orders route:", error);
        res.status(500).json({ message: "Error fetching orders" });
    }
});

// GET order detail
router.get("/orders/:id", adminAuth, async (req, res) => {
    try {
        const [orders] = await db.query(`
            SELECT o.*, u.email, u.first_name, u.last_name,
                o.shipping_address, o.shipping_city,
                o.shipping_postal_code, o.shipping_phone,
                o.payment_proof
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id = ?
        `, [req.params.id]);

        if (orders.length === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const [orderItems] = await db.query(`
            SELECT oi.*, p.name, p.images
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `, [req.params.id]);

        const order = orders[0];
        order.items = orderItems;

        res.json(order);
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Error fetching order details" });
    }
});

// UPDATE order status
router.put("/orders/:id/status", adminAuth, async (req, res) => {
    const { status } = req.body;
    const orderId = req.params.id;

    try {
        if (!['Tertunda', 'Diproses', 'Dikirim', 'Terkirim', 'Dibatalkan'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        await db.query('START TRANSACTION');

        // Update status pesanan
        const [result] = await db.query(
  `UPDATE orders 
   SET status = ?, 
       updated_at = NOW(),
       payment_proof_viewed = CASE 
         WHEN ? = 'Tertunda' THEN FALSE
         WHEN ? IN ('Diproses', 'Dibatalkan') THEN TRUE
         ELSE payment_proof_viewed
       END
   WHERE id = ?`,
  [status, status, status, orderId]
);


        if (result.affectedRows === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ message: 'Order not found' });
        }

        // Jika status diubah menjadi Diproses atau Dibatalkan, tandai bukti pembayaran sebagai sudah dilihat
        if (status === 'Diproses' || status === 'Dibatalkan') {
            await db.query(
                'UPDATE orders SET payment_proof_viewed = TRUE WHERE id = ?',
                [orderId]
            );
        }

        // Jika status Dibatalkan, kembalikan stok produk
        if (status === 'Dibatalkan') {
            const [orderItems] = await db.query(
                'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
                [orderId]
            );

            for (const item of orderItems) {
                await db.query(
                    'UPDATE products SET stock = stock + ? WHERE id = ?',
                    [item.quantity, item.product_id]
                );
            }
        }

        await db.query('COMMIT');
        res.json({ message: 'Order status updated successfully' });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error:', error);
        res.status(500).json({ message: 'Error updating order status' });
    }
});

// Get all users
router.get('/users', adminAuth, async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, email, first_name, last_name, role FROM users');
        res.json(users);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Error fetching users' });
    }
});

// Update user role
router.put('/users/:id/role', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    try {
        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        await db.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
        res.json({ message: 'User role updated successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Error updating user role' });
    }
});

// Create category
router.post('/categories', adminAuth, async (req, res) => {
    try {
        const { name } = req.body;
        const [result] = await db.query('INSERT INTO categories (name) VALUES (?)', [name]);
        res.status(201).json({ id: result.insertId, name });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Error creating category' });
    }
});

// Update category
router.put('/categories/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        await db.query('UPDATE categories SET name = ? WHERE id = ?', [name, id]);
        res.json({ id, name });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Error updating category' });
    }
});

// Delete category
router.delete('/categories/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM categories WHERE id = ?', [id]);
        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Error deleting category' });
    }
});

router.post('/orders/:id/mark-payment-proof-viewed', adminAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    
    await db.query(
      'UPDATE orders SET payment_proof_viewed = TRUE WHERE id = ?',
      [orderId]
    );

    res.json({ message: 'Payment proof marked as viewed' });
  } catch (error) {
    console.error('Error marking payment proof as viewed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint baru untuk melihat bukti pembayaran
router.get("/orders/:id/payment-proof", adminAuth, async (req, res) => {
    try {
        const [order] = await db.query(
            "SELECT payment_proof FROM orders WHERE id = ?",
            [req.params.id]
        );

        if (!order.length || !order[0].payment_proof) {
            return res.status(404).json({ message: "Bukti pembayaran tidak ditemukan" });
        }

        res.json({ payment_proof: order[0].payment_proof });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Error getting payment proof" });
    }
});

module.exports = router;
