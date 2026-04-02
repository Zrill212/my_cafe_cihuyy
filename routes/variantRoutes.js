const express = require("express");
const router = express.Router();
const variantController = require("../controller/variantController");
const verifyToken = require("../middleware/auth");

router.get("/", verifyToken, variantController.getVariats);
router.get(
  "/by-nama-group/:nama_group",
  variantController.getVariatsByNamaGroup,
);
router.get("/:id", verifyToken, variantController.getVariatById);
router.post("/", verifyToken, variantController.createVariat);
router.put("/:id", verifyToken, variantController.updateVariat);
router.delete("/:id", verifyToken, variantController.deleteVariat);

module.exports = router;
