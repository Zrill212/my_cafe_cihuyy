const express = require("express");
const router = express.Router();
const bankTransferController = require("../controller/bankTransferController");
const verifyToken = require("../middleware/auth");

router.get("/", verifyToken, bankTransferController.getBankTransfers);
router.get("/:id", verifyToken, bankTransferController.getBankTransferById);
router.post("/", verifyToken, bankTransferController.createBankTransfer);
router.put("/:id", verifyToken, bankTransferController.updateBankTransfer);
router.delete("/:id", verifyToken, bankTransferController.deleteBankTransfer);

module.exports = router;
