const db = require("../config/db");

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

const queryAsync = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      return resolve(results);
    });
  });
};

function parseFeatures(featuresJson) {
  if (!featuresJson) return {};
  if (typeof featuresJson === "object") return featuresJson;
  try {
    return JSON.parse(featuresJson);
  } catch (_) {
    return {};
  }
}

async function getSubscriptionWithExpiryCheck(cafeId) {
  const rows = await queryAsync(
    `SELECT cs.status, cs.active_until, sp.features_json
     FROM cafe_subscriptions cs
     LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id
     WHERE cs.cafe_id = ?
     LIMIT 1`,
    [cafeId],
  );

  if (!rows || rows.length === 0) return null;

  const sub = rows[0];
  const now = new Date();
  const until = sub.active_until ? new Date(sub.active_until) : null;
  const isExpired = !until || Number.isNaN(until.getTime()) || until.getTime() <= now.getTime();

  if (sub.status === "active" && isExpired) {
    await queryAsync(
      `UPDATE cafe_subscriptions
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE cafe_id = ? AND status = 'active'`,
      [cafeId],
    );
    sub.status = "expired";
  }

  return sub;
}

module.exports = function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      const bypass = String(process.env.SUBSCRIPTION_BYPASS || "").toLowerCase();
      if (bypass === "true" || bypass === "1") {
        return next();
      }

      const cafeId = req.user?.cafe_id;
      if (!cafeId) return sendResponse(res, 401, "Unauthorized", null);

      const sub = await getSubscriptionWithExpiryCheck(cafeId);

      if (!sub) {
        return sendResponse(res, 403, "Langganan tidak aktif", {
          reason: "no_subscription",
          feature: featureKey,
        });
      }

      const now = new Date();
      const until = sub.active_until ? new Date(sub.active_until) : null;
      const isActive = sub.status === "active" && until && until.getTime() > now.getTime();

      if (!isActive) {
        return sendResponse(res, 403, "Langganan tidak aktif", {
          reason: "inactive_or_expired",
          feature: featureKey,
          active_until: sub.active_until || null,
        });
      }

      const features = parseFeatures(sub.features_json);
      const allowed = features && Object.prototype.hasOwnProperty.call(features, featureKey)
        ? Boolean(features[featureKey])
        : false;

      if (!allowed) {
        return sendResponse(res, 403, "Fitur tidak tersedia di paket Anda", {
          reason: "feature_disabled",
          feature: featureKey,
        });
      }

      next();
    } catch (err) {
      console.error("[REQUIRE_FEATURE] error:", err);
      return sendResponse(res, 500, "Terjadi kesalahan pada server", null);
    }
  };
};
