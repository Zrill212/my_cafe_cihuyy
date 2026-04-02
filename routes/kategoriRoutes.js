const express = require("express");
const router = express.Router();
const kategoriController = require("../controller/kategoriController");
const verifyToken = require("../middleware/auth");
const upload = require("../middleware/uploadKategori");
const uploadLogo = require("../middleware/uploadLogo");

router.get("/", verifyToken, kategoriController.getKategoris);
router.get("/user/:cafe_id", kategoriController.getKategorisPublic);
router.get("/:id", verifyToken, kategoriController.getKategoriById);
router.post(
  "/",
  verifyToken,
  uploadLogo.single("logo"),
  kategoriController.createKategori
);
router.put(
  "/:id",
  verifyToken,
  uploadLogo.single("logo"),
  kategoriController.updateKategori
);

router.delete("/:id", verifyToken, kategoriController.deleteKategori);



module.exports = router;
