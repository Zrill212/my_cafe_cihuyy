const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "asset");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const filename = "logo_" + Date.now() + ext;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;