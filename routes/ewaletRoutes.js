const express = require("express");
const router = express.Router();
const ewaletController = require("../controller/ewaletController");
const verifyToken = require("../middleware/auth");

router.get("/", verifyToken, ewaletController.getEwalets);
router.get("/:id", verifyToken, ewaletController.getEwaletById);
router.post("/", verifyToken, ewaletController.createEwalet);
router.put("/:id", verifyToken, ewaletController.updateEwalet);
router.delete("/:id", verifyToken, ewaletController.deleteEwalet);

module.exports = router;
