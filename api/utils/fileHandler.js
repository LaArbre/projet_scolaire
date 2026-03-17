const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

const ALLOWED = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'application/pdf': ['.pdf'],
    'text/plain': ['.txt'],
};

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const unique = crypto.randomBytes(16).toString('hex') + ext;
        cb(null, unique);
    },
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ALLOWED[file.mimetype];

    if (!allowedExts || !allowedExts.includes(ext)) {
        return cb(new Error(`Type de fichier non autorisé : ${file.mimetype} / ${ext}`), false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 },
});

function isSafeFilePath(filePath) {
    const resolved = path.resolve(filePath);
    return resolved.startsWith(UPLOAD_DIR);
}

module.exports = { upload, UPLOAD_DIR, isSafeFilePath };