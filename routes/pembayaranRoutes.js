const express = require("express");
const router = express.Router();
const pembayaranController = require("../controller/pembayaranController");
const verifyToken = require("../middleware/auth");

router.get("/public", pembayaranController.getPembayaranPublic);
router.get("/", verifyToken, pembayaranController.getPembayaran);
router.get("/:id", verifyToken, pembayaranController.getPembayaranById);
router.post("/", verifyToken, pembayaranController.createPembayaran);
router.post("/create-payment", pembayaranController.createPayment);
router.post("/webhook", pembayaranController.handleWebhook);
router.put("/:id", verifyToken, pembayaranController.updatePembayaran);
router.delete("/:id", verifyToken, pembayaranController.deletePembayaran);

module.exports = router;
