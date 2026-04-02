const express = require("express");
const router = express.Router();
const clientIdentity = require("../middleware/clientIdentity");
const clientController = require("../controller/clientController");

router.get("/init", clientIdentity, clientController.initClient);

router.get("/riwayat-pembelian", clientIdentity, clientController.getRiwayatPembelian);

module.exports = router;
