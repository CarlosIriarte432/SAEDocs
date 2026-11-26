const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { uploadDocument } = require('../controllers/docController');
const { verifyToken, requireUploader } = require('../middlewares/authMiddleware');

// El nombre 'file' debe coincidir con el campo del formulario en el frontend
router.post('/upload', verifyToken, requireUploader, upload.single('file'), uploadDocument);

module.exports = router;