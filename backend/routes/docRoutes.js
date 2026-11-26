const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { uploadDocument, analyzeDocument } = require('../controllers/docController');
const { verifyToken, requireUploader } = require('../middlewares/authMiddleware');

router.post('/analyze', verifyToken, requireUploader, upload.single('file'), analyzeDocument);
router.post('/upload', verifyToken, requireUploader, upload.single('file'), uploadDocument);

module.exports = router;