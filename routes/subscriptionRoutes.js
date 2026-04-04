const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/auth");
const authSuperAdmin = require("../middleware/authSuperAdmin");

const subscriptionPlanController = require("../controller/subscriptionPlanController");
const subscriptionController = require("../controller/subscriptionController");

// Super Admin: manage plans
router.get("/superadmin/plans", authSuperAdmin, subscriptionPlanController.listPlans);
router.post("/superadmin/plans", authSuperAdmin, subscriptionPlanController.createPlan);
router.put("/superadmin/plans/:id", authSuperAdmin, subscriptionPlanController.updatePlan);
router.delete("/superadmin/plans/:id", authSuperAdmin, subscriptionPlanController.deletePlan);

// Super Admin: audit subscription transactions
router.get(
  "/superadmin/transactions",
  authSuperAdmin,
  subscriptionController.listSubscriptionTransactionsForSuperAdmin,
);

router.get(
  "/superadmin/transactions/:order_id",
  authSuperAdmin,
  subscriptionController.getSubscriptionTransactionForSuperAdmin,
);

// Admin Cafe: view & checkout subscription
router.get("/plans", verifyToken, subscriptionController.listActivePlans);
// Public (landing page): list active plans without auth
router.get("/plans/public", subscriptionController.listActivePlans);
router.get("/me", verifyToken, subscriptionController.getMySubscription);
router.post("/checkout", verifyToken, subscriptionController.createSubscriptionCheckout);

// Midtrans return callback (no auth): sync status immediately then redirect to frontend billing
router.get("/midtrans/return", subscriptionController.midtransReturn);

// Admin Cafe: check a specific subscription transaction (useful to confirm webhook)
router.get(
  "/transactions/:order_id",
  verifyToken,
  subscriptionController.getMySubscriptionTransaction,
);

// Midtrans webhook (no auth, validated by signature)
router.post("/midtrans/notification", subscriptionController.midtransNotification);

module.exports = router;
