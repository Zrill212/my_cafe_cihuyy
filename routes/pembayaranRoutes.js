const express = require("express");
const router = express.Router();
const pembayaranController = require("../controller/pembayaranController");
const verifyToken = require("../middleware/auth");

router.get("/", verifyToken, pembayaranController.getPembayaran);
router.get("/:id", verifyToken, pembayaranController.getPembayaranById);
router.post("/", verifyToken, pembayaranController.createPembayaran);
router.put("/:id", verifyToken, pembayaranController.updatePembayaran);
router.delete("/:id", verifyToken, pembayaranController.deletePembayaran);

module.exports = router;
