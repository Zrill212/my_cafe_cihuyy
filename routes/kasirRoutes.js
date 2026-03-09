const express = require("express");
const router = express.Router();
const kasirController = require("../controller/kasirController");
const verifyToken = require("../middleware/auth");

router.post("/", verifyToken, kasirController.createKasir);

router.post("/order/payment", verifyToken, kasirController.getOrderPaymentDetail);
router.post("/order/pay", verifyToken, kasirController.payOrder);

router.get("/order/:order_id/payment", verifyToken, kasirController.getOrderPaymentDetail);

router.post("/order/:order_id/pay", verifyToken, kasirController.payOrder);

router.get("/", verifyToken, kasirController.getKasirs);
router.get("/:id", verifyToken, kasirController.getKasirById);
router.put("/:id", verifyToken, kasirController.updateKasir);
router.delete("/:id", verifyToken, kasirController.deleteKasir);

module.exports = router;
