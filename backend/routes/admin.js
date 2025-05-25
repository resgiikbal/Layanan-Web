const express = require("express");
const router = express.Router();
const db = require("../config/database");
const adminAuth = require("../middleware/adminAuth");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

// Buat folder upload jika belum ada
const uploadDir = "uploads/products";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfigurasi multer untuk menyimpan gambar dengan nama unik
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

// POST tambah produk baru
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

        // Insert produk ke database
        const [result] = await db.query(
            "INSERT INTO products (name, description, price, category_id, stock) VALUES (?, ?, ?, ?, ?)",
            [name, description, price, category_id, stock]
        );

        // Simpan gambar ke database
        if (req.files && req.files.length > 0) {
            const imageValues = req.files.map((file) => [
                result.insertId,
                file.filename,
                path.join(uploadDir, file.filename),
            ]);

            await db.query("INSERT INTO product_images (product_id, filename, filepath) VALUES ?", [imageValues]);
        }

        await db.query("COMMIT");

        // Ambil produk yang baru dibuat
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

        // Update data produk
        await db.query(
            "UPDATE products SET name = ?, description = ?, price = ?, category_id = ?, stock = ? WHERE id = ?",
            [name, description, price, category_id, stock, product_id]
        );

        // Hapus gambar lama jika ada gambar baru diunggah
        if (req.files && req.files.length > 0) {
            const [oldImages] = await db.query("SELECT filepath FROM product_images WHERE product_id = ?", [product_id]);

            for (const image of oldImages) {
                await fs.promises.unlink(image.filepath).catch(console.error);
            }

            await db.query("DELETE FROM product_images WHERE product_id = ?", [product_id]);

            // Simpan gambar baru
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

        // Ambil gambar yang terkait
        const [images] = await db.query("SELECT filepath FROM product_images WHERE product_id = ?", [req.params.id]);

        for (const image of images) {
            await fs.promises.unlink(image.filepath).catch(console.error);
        }

        // Hapus data dari database
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

module.exports = router;
