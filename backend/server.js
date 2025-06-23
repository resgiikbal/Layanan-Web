const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs'); // Tambahan: untuk cek dan buat folder

// Load environment variables
dotenv.config();

const app = express();

// ==== CEK & BUAT FOLDER UPLOADS/PAYMENT-PROOFS JIKA BELUM ADA ====
const paymentProofsDir = path.join(__dirname, 'uploads', 'payment-proofs');

if (!fs.existsSync(paymentProofsDir)) {
  fs.mkdirSync(paymentProofsDir, { recursive: true });
  console.log('Folder uploads/payment-proofs berhasil dibuat');
}

// Middleware
app.use(cors());
app.use(express.json());

// Akses file statis dari folder uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware untuk mengizinkan akses ke folder uploads
// Serve static files from uploads folder
app.use('/uploads/payment-proofs', express.static('uploads/payment-proofs'));

// Routes
const productRouter = require('./routes/products');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const categoriesRouter = require('./routes/categories');
const orderRouter = require('./routes/orders');

app.use('/api/products', productRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/categories', categoriesRouter);
Backend-APIs-for-Admin-Analytics
app.use('/api/orders', orderRouter);
app.use('/api/order', orderRouter);
dev

// Jalankan server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
