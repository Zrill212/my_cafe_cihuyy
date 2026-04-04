const midtransClient = require("midtrans-client");
const db = require("../config/db");
const { toPublicError } = require("../utils/publicError");

const snap = new midtransClient.Snap({
  isProduction: String(process.env.MIDTRANS_IS_PRODUCTION || "false").toLowerCase() === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY,
});

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

function mapMidtransTransactionStatus(transactionStatus) {
  if (transactionStatus === "settlement" || transactionStatus === "capture") return "paid";
  if (transactionStatus === "pending") return "pending";
  if (transactionStatus === "expire") return "expired";
  if (transactionStatus === "cancel") return "canceled";
  if (transactionStatus === "deny") return "failed";
  return "pending";
}

async function activateSubscriptionFromTransaction(tx) {
  if (!tx?.cafe_id || !tx?.plan_id) return;

  const planRows = await queryAsync("SELECT * FROM subscription_plans WHERE id = ? LIMIT 1", [tx.plan_id]);
  if (!planRows || planRows.length === 0) return;

  const plan = planRows[0];
  const duration = normalizeDurationFromPlan(plan);
  const now = new Date();

  const currentRows = await queryAsync("SELECT * FROM cafe_subscriptions WHERE cafe_id = ? LIMIT 1", [tx.cafe_id]);

  let baseDate = now;
  if (currentRows && currentRows.length > 0 && currentRows[0].active_until) {
    const currentUntil = new Date(currentRows[0].active_until);
    if (currentUntil.getTime() > now.getTime()) baseDate = currentUntil;
  }

  const nextUntil = addDuration(baseDate, duration);

  await queryAsync(
    `INSERT INTO cafe_subscriptions (cafe_id, plan_id, status, started_at, active_until, last_transaction_id)
     VALUES (?, ?, 'active', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       plan_id = VALUES(plan_id),
       status = 'active',
       started_at = COALESCE(started_at, VALUES(started_at)),
       active_until = VALUES(active_until),
       last_transaction_id = VALUES(last_transaction_id)`,
    [tx.cafe_id, tx.plan_id, now, nextUntil, tx.id],
  );
}

async function syncTransactionStatusFromMidtrans(orderId, midtransStatusPayload) {
  if (!orderId) return null;

  const txRows = await queryAsync("SELECT * FROM subscription_transactions WHERE order_id = ? LIMIT 1", [orderId]);
  if (!txRows || txRows.length === 0) return null;
  const tx = txRows[0];

  const transactionStatus = midtransStatusPayload?.transaction_status || null;
  const paymentType = midtransStatusPayload?.payment_type || null;
  const fraudStatus = midtransStatusPayload?.fraud_status || null;
  const statusCode = midtransStatusPayload?.status_code || null;
  const midtransTransactionId = midtransStatusPayload?.transaction_id || null;

  const newStatus = mapMidtransTransactionStatus(transactionStatus);

  await queryAsync(
    `UPDATE subscription_transactions
     SET status = ?,
         midtrans_transaction_id = ?,
         payment_type = ?,
         transaction_status = ?,
         fraud_status = ?,
         raw_notification_json = ?,
         transaction_time = ?,
         settlement_time = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      newStatus,
      midtransTransactionId,
      paymentType,
      transactionStatus,
      fraudStatus,
      JSON.stringify(midtransStatusPayload || {}),
      midtransStatusPayload?.transaction_time ? new Date(midtransStatusPayload.transaction_time) : null,
      midtransStatusPayload?.settlement_time ? new Date(midtransStatusPayload.settlement_time) : null,
      tx.id,
    ],
  );

  const merged = {
    ...tx,
    status: newStatus,
    payment_type: paymentType,
    transaction_status: transactionStatus,
    fraud_status: fraudStatus,
    status_code: statusCode,
    midtrans_transaction_id: midtransTransactionId,
  };

  if (newStatus === "paid") {
    await activateSubscriptionFromTransaction(merged);
  }

  return merged;
}

function normalizeDurationFromPlan(plan = {}) {
  const rawUnit = String(plan.duration_unit || "").trim().toLowerCase();
  const rawValue = Number(plan.duration_value);
  const rawMinutes = Number(plan.duration_minutes || 0);
  const rawDays = Number(plan.duration_days || 0);

  if (["minute", "day", "month", "year"].includes(rawUnit) && Number.isFinite(rawValue) && rawValue > 0) {
    return {
      unit: rawUnit,
      value: Math.trunc(rawValue),
    };
  }

  if (Number.isFinite(rawMinutes) && rawMinutes > 0) {
    return {
      unit: "minute",
      value: Math.trunc(rawMinutes),
    };
  }

  return {
    unit: "day",
    value: Math.max(0, Math.trunc(rawDays)),
  };
}

function addDuration(baseDate, duration) {
  const nextDate = new Date(baseDate);
  const value = Math.max(0, Math.trunc(Number(duration?.value || 0)));
  const unit = duration?.unit;

  if (!value) return nextDate;

  if (unit === "minute") {
    nextDate.setMinutes(nextDate.getMinutes() + value);
    return nextDate;
  }

  if (unit === "month") {
    nextDate.setMonth(nextDate.getMonth() + value);
    return nextDate;
  }

  if (unit === "year") {
    nextDate.setFullYear(nextDate.getFullYear() + value);
    return nextDate;
  }

  nextDate.setDate(nextDate.getDate() + value);
  return nextDate;
}

function computeRemainingTime(activeUntil) {
  const now = Date.now();
  const until = activeUntil ? new Date(activeUntil).getTime() : NaN;
  const ms = Number.isFinite(until) ? Math.max(0, until - now) : 0;

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    ms,
    total_seconds: totalSeconds,
    total_minutes: Math.floor(totalSeconds / 60),
    total_hours: Math.floor(totalSeconds / 3600),
    total_days: Math.floor(totalSeconds / 86400),
    days,
    hours,
    minutes,
    seconds,
  };
}

async function expireCafeSubscriptionIfNeeded(cafeId) {
  if (!cafeId) return null;

  const rows = await queryAsync(
    `SELECT cs.*, sp.name as plan_name, sp.price as plan_price,
            sp.duration_days, sp.duration_minutes, sp.duration_unit, sp.duration_value, sp.features_json
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

function generateSubOrderId(cafeId) {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `SUB-${cafeId}-${ts}-${rnd}`;
}

function verifyMidtransSignature(notification) {
  try {
    const orderId = notification.order_id;
    const statusCode = notification.status_code;
    const grossAmount = notification.gross_amount;
    const signatureKey = notification.signature_key;

    if (!orderId || !statusCode || !grossAmount || !signatureKey) return false;
    if (!process.env.MIDTRANS_SERVER_KEY) return false;

    const crypto = require("crypto");
    const raw = `${orderId}${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`;
    const expected = crypto.createHash("sha512").update(raw).digest("hex");
    return expected === signatureKey;
  } catch (_) {
    return false;
  }
}

exports.listActivePlans = async (req, res) => {
  try {
    const plans = await queryAsync(
      "SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC, id ASC",
      [],
    );

    const cafeId = req.user?.cafe_id;
    if (!cafeId) {
      const mappedPublic = (plans || []).map((p) => ({
        ...p,
        eligible: true,
        disabled_reason: null,
      }));
      return sendResponse(res, 200, "Berhasil mengambil paket langganan", mappedPublic);
    }

    const freeTx = await queryAsync(
      `SELECT id
       FROM subscription_transactions
       WHERE cafe_id = ?
         AND (payment_type = 'free' OR expected_amount = 0)
         AND status = 'paid'
       LIMIT 1`,
      [cafeId],
    );
    const free_plan_used = Boolean(freeTx && freeTx.length > 0);

    const mapped = (plans || []).map((p) => {
      const price = Number(p.price || 0);
      if (price === 0) {
        return {
          ...p,
          eligible: !free_plan_used,
          disabled_reason: free_plan_used ? "free_plan_already_used" : null,
        };
      }
      return { ...p, eligible: true, disabled_reason: null };
    });

    return sendResponse(res, 200, "Berhasil mengambil paket langganan", mapped);
  } catch (err) {
    const pub = toPublicError(err, "Gagal mengambil paket langganan");
    return sendResponse(res, pub.status, pub.message, []);
  }
};

exports.getSubscriptionTransactionForSuperAdmin = async (req, res) => {
  try {
    const orderId = String(req.params.order_id || "").trim();
    if (!orderId) return sendResponse(res, 400, "order_id wajib diisi", null);

    const rows = await queryAsync(
      `SELECT
         st.id, st.order_id, st.cafe_id, st.admin_id, st.plan_id, st.expected_amount,
         st.status, st.payment_type, st.transaction_status, st.fraud_status,
         st.midtrans_transaction_id, st.transaction_time, st.settlement_time,
         st.created_at, st.updated_at,
         st.raw_notification_json,
         c.nama_cafe,
         sp.name as plan_name, sp.price as plan_price, sp.duration_days
       FROM subscription_transactions st
       LEFT JOIN cafe c ON c.id = st.cafe_id
       LEFT JOIN subscription_plans sp ON sp.id = st.plan_id
       WHERE st.order_id = ?
       LIMIT 1`,
      [orderId],
    );

    if (!rows || rows.length === 0) {
      return sendResponse(res, 404, "Transaksi langganan tidak ditemukan", null);
    }

    const tx = rows[0];
    tx.webhook_received = Boolean(tx.raw_notification_json);

    return sendResponse(res, 200, "Berhasil mengambil transaksi langganan", tx);
  } catch (err) {
    console.error("[SUBSCRIPTION][SUPERADMIN][TX_GET] error:", err);
    const pub = toPublicError(err, "Gagal mengambil transaksi langganan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.getMySubscriptionTransaction = async (req, res) => {
  try {
    const cafeId = req.user?.cafe_id;
    if (!cafeId) return sendResponse(res, 401, "Unauthorized", null);

    const orderId = String(req.params.order_id || "").trim();
    if (!orderId) return sendResponse(res, 400, "order_id wajib diisi", null);

    const rows = await queryAsync(
      `SELECT
         id, order_id, cafe_id, plan_id, expected_amount,
         status, payment_type, transaction_status, fraud_status,
         midtrans_transaction_id, transaction_time, settlement_time,
         created_at, updated_at,
         raw_notification_json
       FROM subscription_transactions
       WHERE order_id = ? AND cafe_id = ?
       LIMIT 1`,
      [orderId, cafeId],
    );

    if (!rows || rows.length === 0) {
      return sendResponse(res, 404, "Transaksi langganan tidak ditemukan", null);
    }

    const tx = rows[0];
    tx.webhook_received = Boolean(tx.raw_notification_json);

    return sendResponse(res, 200, "Berhasil mengambil transaksi langganan", tx);
  } catch (err) {
    console.error("[SUBSCRIPTION][MY_TX_GET] error:", err);
    const pub = toPublicError(err, "Gagal mengambil transaksi langganan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.getMySubscription = async (req, res) => {
  try {
    const cafeId = req.user?.cafe_id;
    if (!cafeId) return sendResponse(res, 401, "Unauthorized", null);

    const sub = await expireCafeSubscriptionIfNeeded(cafeId);

    if (!sub) {
      return sendResponse(res, 200, "Berhasil mengambil langganan", {
        cafe_id: cafeId,
        status: "inactive",
        plan_id: null,
        active_until: null,
        remaining_time: computeRemainingTime(null),
      });
    }

    return sendResponse(res, 200, "Berhasil mengambil langganan", {
      ...sub,
      remaining_time: computeRemainingTime(sub.active_until),
    });
  } catch (err) {
    const pub = toPublicError(err, "Gagal mengambil langganan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.createSubscriptionCheckout = async (req, res) => {
  try {
    const cafeId = req.user?.cafe_id;
    const adminId = req.user?.id;

    if (!cafeId) return sendResponse(res, 401, "Unauthorized", null);

    const { plan_id, price } = req.body;
    const planId = Number(plan_id);
    const clientPrice = Number(price);

    if (!Number.isFinite(planId) || planId <= 0) {
      return sendResponse(res, 400, "plan_id tidak valid", null);
    }

    const planRows = await queryAsync(
      "SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1",
      [planId],
    );

    if (!planRows || planRows.length === 0) {
      return sendResponse(res, 404, "Paket langganan tidak ditemukan", null);
    }

    const plan = planRows[0];
    const expectedAmount = Number(plan.price || 0);

    if (!Number.isFinite(expectedAmount) || expectedAmount < 0) {
      return sendResponse(res, 500, "Harga paket tidak valid di server", null);
    }

    // Frontend mengirim harga, backend wajib validasi
    if (!Number.isFinite(clientPrice) || clientPrice !== expectedAmount) {
      return sendResponse(res, 400, "Harga tidak sesuai dengan paket", {
        expected_price: expectedAmount,
        received_price: Number.isFinite(clientPrice) ? clientPrice : null,
      });
    }

    // Paket gratis: jangan panggil Midtrans (gross_amount tidak boleh 0)
    if (expectedAmount === 0) {
      const usedRows = await queryAsync(
        `SELECT id
         FROM subscription_transactions
         WHERE cafe_id = ?
           AND (payment_type = 'free' OR expected_amount = 0)
           AND status = 'paid'
         LIMIT 1`,
        [cafeId],
      );
      if (usedRows && usedRows.length > 0) {
        return sendResponse(res, 403, "Paket gratis hanya bisa dipakai 1 kali", {
          reason: "free_plan_already_used",
        });
      }

      const orderId = generateSubOrderId(cafeId);

      const insertResult = await queryAsync(
        `INSERT INTO subscription_transactions
         (order_id, cafe_id, admin_id, plan_id, expected_amount, status, payment_type, transaction_status)
         VALUES (?, ?, ?, ?, ?, 'paid', 'free', 'settlement')`,
        [orderId, cafeId, adminId || null, planId, expectedAmount],
      );

      const duration = normalizeDurationFromPlan(plan);
      const now = new Date();

      const currentRows = await queryAsync(
        "SELECT * FROM cafe_subscriptions WHERE cafe_id = ? LIMIT 1",
        [cafeId],
      );

      let baseDate = now;
      if (currentRows && currentRows.length > 0 && currentRows[0].active_until) {
        const currentUntil = new Date(currentRows[0].active_until);
        if (currentUntil.getTime() > now.getTime()) baseDate = currentUntil;
      }

      const nextUntil = addDuration(baseDate, duration);

      await queryAsync(
        `INSERT INTO cafe_subscriptions (cafe_id, plan_id, status, started_at, active_until, last_transaction_id)
         VALUES (?, ?, 'active', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           plan_id = VALUES(plan_id),
           status = 'active',
           started_at = COALESCE(started_at, VALUES(started_at)),
           active_until = VALUES(active_until),
           last_transaction_id = VALUES(last_transaction_id)`,
        [cafeId, planId, now, nextUntil, insertResult.insertId],
      );

      return sendResponse(res, 200, "Berhasil membuat pembayaran langganan", {
        order_id: orderId,
        plan_id: planId,
        expected_amount: expectedAmount,
        snap_token: null,
        redirect_url: null,
        finish_url: null,
        unfinish_url: null,
        error_url: null,
        method: "free",
        active_until: nextUntil,
      });
    }

    if (!process.env.MIDTRANS_SERVER_KEY) {
      return sendResponse(res, 500, "MIDTRANS_SERVER_KEY belum diset", null);
    }

    const orderId = generateSubOrderId(cafeId);

    const insertResult = await queryAsync(
      `INSERT INTO subscription_transactions (order_id, cafe_id, admin_id, plan_id, expected_amount, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [orderId, cafeId, adminId || null, planId, expectedAmount],
    );

    const baseUrlFromEnv = (process.env.BASE_URL || "").replace(/\/+$/, "");
    const requestBaseUrl = `${req.protocol}://${req.get("host")}`.replace(/\/+$/, "");
    const apiBaseUrl = baseUrlFromEnv || requestBaseUrl;

    const buildCallbackUrl = (result) => {
      if (!apiBaseUrl) return null;
      const url = new URL(`${apiBaseUrl}/api/subscriptions/midtrans/return`);
      url.searchParams.set("order_id", orderId);
      url.searchParams.set("result", result);
      return url.toString();
    };

    const finishUrl = buildCallbackUrl("finish");
    const unfinishUrl = buildCallbackUrl("unfinish");
    const errorUrl = buildCallbackUrl("error");

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: expectedAmount,
      },
      item_details: [
        {
          id: `plan-${planId}`,
          price: expectedAmount,
          quantity: 1,
          name: `Langganan ${plan.name}`.slice(0, 50),
        },
      ],
      customer_details: {
        first_name: "Admin",
        email: "admin@mycafe.com",
      },
    };

    if (finishUrl) {
      parameter.callbacks = {
        finish: finishUrl,
        unfinish: unfinishUrl,
        error: errorUrl,
      };
    }

    const transaction = await snap.createTransaction(parameter);

    await queryAsync(
      "UPDATE subscription_transactions SET snap_token = ?, redirect_url = ? WHERE id = ?",
      [transaction.token, transaction.redirect_url, insertResult.insertId],
    );

    return sendResponse(res, 200, "Berhasil membuat pembayaran langganan", {
      order_id: orderId,
      plan_id: planId,
      expected_amount: expectedAmount,
      snap_token: transaction.token,
      redirect_url: transaction.redirect_url,
      finish_url: finishUrl,
      unfinish_url: unfinishUrl,
      error_url: errorUrl,
    });
  } catch (err) {
    console.error("[SUBSCRIPTION][CHECKOUT] error:", err);

    if (err?.code === "ER_NO_SUCH_TABLE") {
      return sendResponse(
        res,
        500,
        "Tabel subscription_transactions/subscription_plans belum ada. Jalankan migrate.js dulu",
        null,
      );
    }

    if (!process.env.MIDTRANS_SERVER_KEY) {
      return sendResponse(res, 500, "MIDTRANS_SERVER_KEY belum diset", null);
    }

    const rawMessage = String(err?.message || err?.ApiResponse?.status_message || "").toLowerCase();
    if (rawMessage.includes("midtrans") || rawMessage.includes("snap") || rawMessage.includes("merchant")) {
      return sendResponse(
        res,
        500,
        `Gagal membuat transaksi Midtrans: ${String(err?.message || "").slice(0, 180)}`,
        null,
      );
    }

    const pub = toPublicError(err, "Gagal membuat pembayaran langganan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.midtransReturn = async (req, res) => {
  try {
    const orderId = String(req.query.order_id || "").trim();
    const result = String(req.query.result || "finish").trim();

    const frontendBaseUrl = (process.env.FRONTEND_BASE_URL || "").replace(/\/+$/, "");
    const frontendReturnPathRaw = process.env.FRONTEND_RETURN_PATH || "/admin/billing";
    const frontendReturnPath = frontendReturnPathRaw.startsWith("/")
      ? frontendReturnPathRaw
      : `/${frontendReturnPathRaw}`;

    if (!frontendBaseUrl) {
      return res.status(500).send("FRONTEND_BASE_URL belum diset");
    }

    const url = new URL(`${frontendBaseUrl}${frontendReturnPath}`);
    if (orderId) url.searchParams.set("order_id", orderId);
    if (result) url.searchParams.set("result", result);

    if (!orderId) {
      return res.redirect(url.toString());
    }

    let midtransStatus = null;
    try {
      midtransStatus = await snap.transaction.status(orderId);
    } catch (err) {
      console.error("[SUBSCRIPTION][RETURN] midtrans status error:", err);
    }

    if (midtransStatus) {
      url.searchParams.set("status_code", String(midtransStatus.status_code || ""));
      url.searchParams.set("transaction_status", String(midtransStatus.transaction_status || ""));

      try {
        await syncTransactionStatusFromMidtrans(orderId, midtransStatus);
        url.searchParams.set("synced", "1");
      } catch (err) {
        console.error("[SUBSCRIPTION][RETURN] sync error:", err);
        url.searchParams.set("synced", "0");
      }
    }

    return res.redirect(url.toString());
  } catch (err) {
    console.error("[SUBSCRIPTION][RETURN] error:", err);
    return res.status(500).send("Terjadi kesalahan pada server");
  }
};

exports.midtransNotification = async (req, res) => {
  try {
    const notification = req.body || {};

    // Verify signature (recommended)
    const ok = verifyMidtransSignature(notification);
    if (!ok) {
      return sendResponse(res, 401, "Signature tidak valid", null);
    }

    const orderId = notification.order_id;
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;
    const paymentType = notification.payment_type;

    const txRows = await queryAsync(
      "SELECT * FROM subscription_transactions WHERE order_id = ? LIMIT 1",
      [orderId],
    );

    if (!txRows || txRows.length === 0) {
      return sendResponse(res, 404, "Transaksi langganan tidak ditemukan", null);
    }

    const tx = txRows[0];

    const newStatus = mapMidtransTransactionStatus(transactionStatus);

    await queryAsync(
      `UPDATE subscription_transactions
       SET status = ?,
           midtrans_transaction_id = ?,
           payment_type = ?,
           transaction_status = ?,
           fraud_status = ?,
           raw_notification_json = ?,
           transaction_time = ?,
           settlement_time = ?
       WHERE id = ?`,
      [
        newStatus,
        notification.transaction_id || null,
        paymentType || null,
        transactionStatus || null,
        fraudStatus || null,
        JSON.stringify(notification),
        notification.transaction_time ? new Date(notification.transaction_time) : null,
        notification.settlement_time ? new Date(notification.settlement_time) : null,
        tx.id,
      ],
    );

    // If paid -> activate/extend cafe subscription
    if (newStatus === "paid") {
      await activateSubscriptionFromTransaction(tx);
    }

    return sendResponse(res, 200, "OK", { received: true, status: newStatus });
  } catch (err) {
    console.error("[SUBSCRIPTION][NOTIF] error:", err);
    return sendResponse(res, 500, "Terjadi kesalahan pada server", null);
  }
};

exports.listSubscriptionTransactionsForSuperAdmin = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const cafeId = req.query.cafe_id ? Number(req.query.cafe_id) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const planId = req.query.plan_id ? Number(req.query.plan_id) : null;
    const q = req.query.q ? String(req.query.q) : null; // order_id search
    const dateFrom = req.query.date_from ? String(req.query.date_from) : null; // YYYY-MM-DD
    const dateTo = req.query.date_to ? String(req.query.date_to) : null; // YYYY-MM-DD

    const where = [];
    const params = [];

    if (Number.isFinite(cafeId) && cafeId > 0) {
      where.push("st.cafe_id = ?");
      params.push(cafeId);
    }
    if (status) {
      where.push("st.status = ?");
      params.push(status);
    }
    if (Number.isFinite(planId) && planId > 0) {
      where.push("st.plan_id = ?");
      params.push(planId);
    }
    if (q) {
      where.push("st.order_id LIKE ?");
      params.push(`%${q}%`);
    }
    if (dateFrom) {
      where.push("DATE(st.created_at) >= DATE(?)");
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push("DATE(st.created_at) <= DATE(?)");
      params.push(dateTo);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countRows = await queryAsync(
      `SELECT COUNT(*) as total
       FROM subscription_transactions st
       ${whereSql}`,
      params,
    );
    const total = Number(countRows?.[0]?.total || 0);

    const listParams = [...params, limit, offset];
    const rows = await queryAsync(
      `SELECT
         st.id, st.order_id, st.cafe_id, st.admin_id, st.plan_id, st.expected_amount,
         st.status, st.payment_type, st.transaction_status, st.fraud_status,
         st.midtrans_transaction_id, st.transaction_time, st.settlement_time,
         st.created_at, st.updated_at,
         c.nama_cafe,
         sp.name as plan_name, sp.price as plan_price, sp.duration_days
       FROM subscription_transactions st
       LEFT JOIN cafe c ON c.id = st.cafe_id
       LEFT JOIN subscription_plans sp ON sp.id = st.plan_id
       ${whereSql}
       ORDER BY st.id DESC
       LIMIT ? OFFSET ?`,
      listParams,
    );

    return sendResponse(res, 200, "Berhasil mengambil transaksi langganan", {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      rows: rows || [],
    });
  } catch (err) {
    console.error("[SUBSCRIPTION][SUPERADMIN][TX_LIST] error:", err);
    const pub = toPublicError(err, "Gagal mengambil transaksi langganan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};
