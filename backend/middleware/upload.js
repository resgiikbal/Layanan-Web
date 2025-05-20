const multer = require('multer');
const path = require('path');

// configure storage (perbaikan typo dari "configre" ke "configure")
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/products/');
    },
    filename: function (req, file, cb) { // perbaikan dari "file" ke "filename"
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '_' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File Filter
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) { // perbaikan dari "startWith" ke "startsWith"
        cb(null, true); // perbaikan dari "cb(null, type);" ke "cb(null, true);"
    } else {
        cb(new Error('Not an image! Please upload an image'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // perbaikan dari "fileSize 5 * 1024" ke "fileSize: 5 * 1024 * 1024"
    }
});

module.exports = upload;
