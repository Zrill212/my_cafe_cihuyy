const express = require("express");
const router = express.Router();
const midtransController = require("../controller/midtransController");
const clientIdentity = require("../middleware/clientIdentity");

router.get("/config", midtransController.getConfig);

// CREATE TRANSACTION (butuh fingerprint/header agar masuk riwayat_pembelian)
router.post("/create", clientIdentity, midtransController.createTransaction);
// alias untuk request lama
router.post("/create-payment", clientIdentity, midtransController.createTransaction);

// WEBHOOK NOTIFICATION
router.post("/notification", midtransController.notification);

// RETURN / REDIRECT AFTER PAYMENT (cookie fingerprint → isi riwayat_pembelian)
router.get("/return", clientIdentity, midtransController.returnHandler);

// CEK STATUS
router.get("/status/:orderId", midtransController.checkStatus);

module.exports = router;