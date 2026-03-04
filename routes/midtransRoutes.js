const express = require("express");
const router = express.Router();
const midtransController = require("../controller/midtransController");

// CREATE TRANSACTION
router.post("/create", midtransController.createTransaction);

// CEK STATUS
router.get("/status/:orderId", midtransController.checkStatus);

module.exports = router;