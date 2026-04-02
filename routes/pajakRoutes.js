const express = require("express");
const router = express.Router();
const pajakController = require("../controller/pajakController");
const verifyToken = require("../middleware/auth");

router.get("/public/:cafe_id", pajakController.getPajakPublic);
router.get("/", verifyToken, pajakController.getPajak);

router.get("/admin", verifyToken, pajakController.adminGetAll);
router.put("/admin", verifyToken, pajakController.upsertPajak);

module.exports = router;
