const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/auth");
const withdrawalController = require("../controller/withdrawalController");

router.post("/", verifyToken, withdrawalController.create);
router.get("/", verifyToken, withdrawalController.listMine);
router.get("/balance", verifyToken, withdrawalController.getBalance);

module.exports = router;
