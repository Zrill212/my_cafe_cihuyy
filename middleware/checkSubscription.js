const db = require("../config/db");

const queryAsync = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      return resolve(results);
    });
  });
};

const getBillingRedirectUrl = () => {
  try {
    const frontendBaseUrl = String(process.env.FRONTEND_BASE_URL || "").replace(/\/+$/, "");
    if (!frontendBaseUrl) return null;

    const frontendReturnPathRaw = process.env.FRONTEND_RETURN_PATH || "/admin/billing";
    const frontendReturnPath = frontendReturnPathRaw.startsWith("/")
      ? frontendReturnPathRaw
      : `/${frontendReturnPathRaw}`;

    return `${frontendBaseUrl}${frontendReturnPath}`;
  } catch (_) {
    return null;
  }
};

const sendSubscriptionRequired = (res, payload = {}) => {
  const redirectTo = getBillingRedirectUrl();
  return res.status(402).json({
    message: "Langganan habis, silakan bayar",
    reason: "subscription_required",
    redirect_to: redirectTo,
    ...payload,
  });
};

const checkSubscription = async (req, res, next) => {
  try {
    const cafeId = req.user?.cafe_id;
    if (!cafeId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const rows = await queryAsync(
      `SELECT status, active_until
       FROM cafe_subscriptions
       WHERE cafe_id = ?
       LIMIT 1`,
      [cafeId],
    );

    if (!rows || rows.length === 0) {
      return sendSubscriptionRequired(res, { status: "inactive", active_until: null });
    }

    const subscription = rows[0];
    const now = new Date();
    const until = subscription.active_until ? new Date(subscription.active_until) : null;
    const isExpired = !until || Number.isNaN(until.getTime()) || until.getTime() <= now.getTime();

    if (subscription.status === "active" && isExpired) {
      await queryAsync(
        `UPDATE cafe_subscriptions
         SET status = 'expired', updated_at = CURRENT_TIMESTAMP
         WHERE cafe_id = ? AND status = 'active'`,
        [cafeId],
      );
      subscription.status = "expired";
    }

    const isActive = subscription.status === "active" && until && until.getTime() > now.getTime();
    if (!isActive) {
      return sendSubscriptionRequired(res, {
        status: subscription.status || "inactive",
        active_until: subscription.active_until || null,
      });
    }

    next();
  } catch (_) {
    return res.status(500).json({ message: "Error" });
  }
};

module.exports = checkSubscription;