const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const productRouter = require('./routes/products');
const authRouter = require('./routes/auth');

dotenv.config();

const app = express();

//Middleware
app.use(cors());
app.use(express.json());

//Routes
app.use('/api/products', productRouter);
app.use('/api/auth', authRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT,() => {
    console.log(`Server running on port ${PORT}`);
})