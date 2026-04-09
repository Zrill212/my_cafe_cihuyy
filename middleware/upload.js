const multer = require("multer");
const path = require("path");
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    // Naikkan limit agar upload menu tidak sering 413.
    // Jika reverse proxy (nginx) masih membatasi, perlu naikkan client_max_body_size juga.
    fileSize: 20 * 1024 * 1024,
  },
});



module.exports = upload;
