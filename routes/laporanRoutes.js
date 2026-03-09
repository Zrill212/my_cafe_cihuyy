const express = require("express");
const router = express.Router();
const laporanController = require("../controller/laporanController");
const verifyToken = require("../middleware/auth");

router.get("/", verifyToken, laporanController.getLaporan);

module.exports = router;
