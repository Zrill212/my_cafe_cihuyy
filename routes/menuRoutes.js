const express = require('express');
const router = express.Router();
const menuController = require('../controller/menuController');
const verifyToken = require("../middleware/auth");
const upload = require("../middleware/upload");
const multer = require("multer");

const uploadMenuImage = (req, res, next) => {
  return upload.single("image")(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          status: 413,
          message: "Ukuran gambar terlalu besar. Maksimal 20MB.",
          data: { reason: "file_too_large", max_mb: 20 },
          success: false,
        });
      }
      return res.status(400).json({
        status: 400,
        message: "Upload gambar gagal",
        data: { reason: err.code || "multer_error" },
        success: false,
      });
    }

    return res.status(400).json({
      status: 400,
      message: "Upload gambar gagal",
      data: { reason: "upload_failed" },
      success: false,
    });
  });
};


router.get('/', verifyToken, menuController.getMenus);



router.get("/user/:cafe_id/:id", menuController.getMenuByIdPublic);

router.get('/:id', verifyToken, menuController.getMenuById);

router.get("/user/:cafe_id", menuController.getMenusPublic);


router.post('/', verifyToken, uploadMenuImage, menuController.createMenu);



router.put('/:id', verifyToken, uploadMenuImage, menuController.updateMenu);



router.delete('/:id', verifyToken, menuController.deleteMenu);

module.exports = router;