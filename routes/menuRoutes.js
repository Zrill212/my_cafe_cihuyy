const express = require('express');
const router = express.Router();
const menuController = require('../controller/menuController');
const verifyToken = require("../middleware/auth");
const upload = require("../middleware/upload");


router.get('/', verifyToken, menuController.getMenus);



router.get('/:id', verifyToken, menuController.getMenuById);

router.get("/user/:cafe_id", menuController.getMenusPublic);


router.post('/', verifyToken, upload.single("image"), menuController.createMenu);



router.put('/:id', verifyToken, upload.single("image"), menuController.updateMenu);



router.delete('/:id', verifyToken, menuController.deleteMenu);

module.exports = router;