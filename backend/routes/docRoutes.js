const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { verifyToken, requireUploader } = require('../middlewares/authMiddleware');
const { uploadDocument, updateDocument } = require('../controllers/docController');

// Subir un documento nuevo (solo admin y user)
router.post('/upload', verifyToken, requireUploader, upload.single('file'), uploadDocument);

// Editar fecha y/o reemplazar archivo de un documento existente (solo admin y user)
router.put('/:id', verifyToken, requireUploader, upload.single('file'), updateDocument);

module.exports = router;