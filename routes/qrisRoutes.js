const express = require("express");
const router = express.Router();
const qrisController = require("../controller/qrisController");
const verifyToken = require("../middleware/auth");

router.get("/", verifyToken, qrisController.getQris);
router.get("/:id", verifyToken, qrisController.getQrisById);
router.post("/", verifyToken, qrisController.createQris);
router.put("/:id", verifyToken, qrisController.updateQris);
router.delete("/:id", verifyToken, qrisController.deleteQris);

module.exports = router;
