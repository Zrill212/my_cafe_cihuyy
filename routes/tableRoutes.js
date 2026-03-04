const express = require("express");
const router = express.Router();
const tableController = require("../controller/tableController");
const verifyToken = require("../middleware/auth");

// GET /api/tables - get all tables for this cafe
router.get("/", verifyToken, tableController.getTables);

// GET /api/tables/:id - get table by id
router.get("/:id", verifyToken, tableController.getTableById);

// GET /api/tables/:id/qr - get QR code data URL for a table
router.get("/:id/qr", verifyToken, tableController.getTableQR);

// POST /api/tables - create new table (auto nomor meja + QR)
router.post("/", verifyToken, tableController.createTable);

// PUT /api/tables/:id - update table (status)
router.put("/:id", verifyToken, tableController.updateTable);

// DELETE /api/tables/:id - delete table
router.delete("/:id", verifyToken, tableController.deleteTable);

module.exports = router;
