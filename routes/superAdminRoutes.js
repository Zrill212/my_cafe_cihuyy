const express = require("express");
const router = express.Router();
const superAdminController = require("../controller/superAdminController");
const withdrawalController = require("../controller/withdrawalController");
const authSuperAdmin = require("../middleware/authSuperAdmin");

// Login (public)
router.post("/login", superAdminController.login);

// Public settings (maintenance mode, etc)
router.get("/settings/public", superAdminController.getPublicSettings);

// Dashboard & Statistics (protected)
router.get("/stats", authSuperAdmin, superAdminController.getDashboardStats);
router.get("/subscription-balance", authSuperAdmin, superAdminController.getSubscriptionBalance);
router.get("/activities", authSuperAdmin, superAdminController.getActivities);

// Cafe Management (protected)
router.get("/cafes", authSuperAdmin, superAdminController.getAllCafes);
router.get("/cafes/:id", authSuperAdmin, superAdminController.getCafeDetail);
router.patch("/cafes/:id/status", authSuperAdmin, superAdminController.toggleCafeStatus);

// Admin Management (protected)
router.get("/admins", authSuperAdmin, superAdminController.getAllAdmins);

// Reports & Analytics (protected)
router.get("/reports", authSuperAdmin, superAdminController.getReports);
router.get("/analytics", authSuperAdmin, superAdminController.getAnalytics);

// Settings (protected)
router.get("/settings", authSuperAdmin, superAdminController.getSettings);
router.put("/settings", authSuperAdmin, superAdminController.updateSettings);

// Pencairan saldo cafe → transfer manual oleh superadmin
router.get("/withdrawals", authSuperAdmin, withdrawalController.superAdminList);
router.patch("/withdrawals/:id/complete", authSuperAdmin, withdrawalController.superAdminComplete);
router.patch("/withdrawals/:id/reject", authSuperAdmin, withdrawalController.superAdminReject);

module.exports = router;
