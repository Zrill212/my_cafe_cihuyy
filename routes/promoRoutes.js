const express = require("express");
const router = express.Router();
const promoController = require("../controller/promoController");
const verifyToken = require("../middleware/auth");

router.get("/user/:cafe_id", promoController.getPromosPublic);
router.post("/user/validate", promoController.validatePromo);
router.get("/", verifyToken, promoController.getPromos);
router.get("/:id", verifyToken, promoController.getPromoById);
router.post("/", verifyToken, promoController.createPromo);
router.put("/:id", verifyToken, promoController.updatePromo);
router.delete("/:id", verifyToken, promoController.deletePromo);

module.exports = router;
