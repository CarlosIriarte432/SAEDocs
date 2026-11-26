const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { verifyToken, requireUploader } = require('../middlewares/authMiddleware');
const { uploadDocument, updateDocument } = require('../controllers/docController');

router.post('/upload', verifyToken, requireUploader, upload.single('file'), uploadDocument);
router.put('/:id', verifyToken, requireUploader, upload.single('file'), updateDocument);

module.exports = router;