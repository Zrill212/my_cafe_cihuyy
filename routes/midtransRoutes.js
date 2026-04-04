const express = require("express");
const router = express.Router();
const midtransController = require("../controller/midtransController");

// CREATE TRANSACTION
router.post("/create", midtransController.createTransaction);
// alias untuk request lama
router.post("/create-payment", midtransController.createTransaction);

// WEBHOOK NOTIFICATION
router.post("/notification", midtransController.notification);

// CEK STATUS
router.get("/status/:orderId", midtransController.checkStatus);

module.exports = router;