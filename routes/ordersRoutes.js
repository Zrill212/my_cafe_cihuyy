// routes/OrderRoutes.js
const express    = require("express");
const router     = express.Router();
const auth       = require("../middleware/auth");
const OrderCtrl  = require("../controller/ordersController");

/* ── ADMIN (butuh JWT) ───────────────────────────────────────────────────── */
router.get   ("/admin",             auth, OrderCtrl.adminGetAll);
router.get   ("/admin/:id",         auth, OrderCtrl.adminGetOne);
router.patch ("/admin/:id/status",  auth, OrderCtrl.adminUpdateStatus);
router.delete("/admin/:id",         auth, OrderCtrl.adminDelete);

/* ── USER / PELANGGAN (publik) ───────────────────────────────────────────── */
router.post  ("/",    OrderCtrl.userCreate);
router.get   ("/",    OrderCtrl.userGetByMeja);
router.get   ("/:id/status", OrderCtrl.userGetStatus);
router.get   ("/:id", OrderCtrl.userGetOne);
module.exports = router;