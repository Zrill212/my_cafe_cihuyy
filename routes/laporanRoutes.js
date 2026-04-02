const express = require("express");
const router = express.Router();
const laporanController = require("../controller/laporanController");
const verifyToken = require("../middleware/auth");

const requireFeature = require("../middleware/requireFeature");

router.get("/", verifyToken, requireFeature("reports"), laporanController.getLaporan);

module.exports = router;
