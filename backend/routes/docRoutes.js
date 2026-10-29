const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { uploadDocument } = require('../controllers/docController');

// El nombre 'file' debe coincidir con el campo del formulario en el frontend
router.post('/upload', upload.single('file'), uploadDocument);

module.exports = router;