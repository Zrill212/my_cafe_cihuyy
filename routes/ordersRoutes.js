// routes/OrderRoutes.js
const express   = require("express");
const router    = express.Router();
const auth      = require("../middleware/auth");
const OrderCtrl = require("../controller/ordersController");
const clientIdentity = require("../middleware/clientIdentity");

/* ── ADMIN (butuh JWT) ───────────────────────────────────────────────────── */
router.get   ("/admin",            auth, OrderCtrl.adminGetAll);
router.get   ("/admin/midtrans-balance", auth, OrderCtrl.adminGetMidtransBalance);
router.get   ("/admin/saldo",      auth, OrderCtrl.adminGetSaldo);
router.get   ("/admin/:id",        auth, OrderCtrl.adminGetOne);
router.patch ("/admin/:id/status", auth, OrderCtrl.adminUpdateStatus);
router.delete("/admin/:id",        auth, OrderCtrl.adminDelete);

/* ── KASIR (butuh JWT) ───────────────────────────────────────────────────── */
// Pakai prefix /kasir/ agar tidak bentrok dengan GET /:id/status milik user
router.get("/kasir",              auth, OrderCtrl.kasirGetList);
router.post("/kasir",             auth, OrderCtrl.kasirCreate);
router.patch("/kasir/:id/status",  auth, OrderCtrl.kasirUpdateStatus);

/* ── USER / PELANGGAN (publik) ───────────────────────────────────────────── */
router.post("/",          clientIdentity, OrderCtrl.userCreate);
router.get("/",           OrderCtrl.userGetByMeja);
router.get("/:id/status", OrderCtrl.userGetStatus);
router.get("/:id",        OrderCtrl.userGetOne);

module.exports = router;