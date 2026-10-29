const express = require('express');
const router = express.Router();
const { getVehicleWithDocs } = require('../controllers/vehicleController');

// El endpoint quedará como: GET /api/vehicles/AB-CD-12
router.get('/:plate', getVehicleWithDocs);

module.exports = router;