const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const pengaturanController = require("../controller/pengaturanController");
const verifyToken = require("../middleware/auth"); // tanpa destructuring

// GET  /api/pengaturan        → ambil pengaturan kafe
// POST /api/pengaturan        → simpan pengaturan kafe
// PUT  /api/pengaturan/password → ganti password admin

router.get("/",           verifyToken, pengaturanController.getPengaturan);
router.get("/user/:cafe_id", pengaturanController.getPengaturanPublic);
router.post("/",          verifyToken, pengaturanController.savePengaturan);
router.put("/password",   verifyToken, pengaturanController.gantiPassword);
router.put(
  "/",
  verifyToken,
  upload.single("logo_cafe"),
  pengaturanController.savePengaturan
);

module.exports = router;