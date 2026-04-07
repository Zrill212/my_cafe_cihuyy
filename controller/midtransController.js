const midtransClient = require("midtrans-client");
const db = require("../config/db");
require("dotenv").config();
const { toPublicError } = require("../utils/publicError");

const buildFrontendPaymentReturnUrl = ({ orderId, result, paymentStatus, transactionStatus, statusCode, synced }) => {
  const frontendBaseUrl = String(process.env.FRONTEND_BASE_URL || "").replace(/\/+$/, "");
  if (!frontendBaseUrl) return null;

  const rawPath = process.env.FRONTEND_ORDER_RETURN_PATH || process.env.FRONTEND_RETURN_PATH || "/user";
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

  const url = new URL(`${frontendBaseUrl}${path}`);
  if (orderId) url.searchParams.set("order_id", String(orderId));
  if (result) url.searchParams.set("result", String(result));
  if (paymentStatus) url.searchParams.set("payment_status", String(paymentStatus));
  if (transactionStatus) url.searchParams.set("transaction_status", String(transactionStatus));
  if (statusCode) url.searchParams.set("status_code", String(statusCode));
  if (synced !== undefined && synced !== null) url.searchParams.set("synced", String(synced ? 1 : 0));
  return url.toString();
};

const buildApiBaseUrl = (req) => {
  const explicit = (
    process.env.API_BASE_URL ||
    process.env.BACKEND_BASE_URL ||
    process.env.BASE_URL ||
    ""
  ).replace(/\/+$/, "");
  const requestBase = `${req.protocol}://${req.get("host")}`.replace(/\/+$/, "");
  return explicit || requestBase;
};

const buildMidtransReturnUrl = (req, orderId, result) => {
  const apiBaseUrl = buildApiBaseUrl(req);
  if (!apiBaseUrl) return null;
  const url = new URL(`${apiBaseUrl}/api/midtrans/return`);
  if (orderId) url.searchParams.set("order_id", String(orderId));
  if (result) url.searchParams.set("result", String(result));
  return url.toString();
};

function mapMidtransOrderStatus(transactionStatus) {
  if (transactionStatus === "settlement" || transactionStatus === "capture") return "paid";
  if (transactionStatus === "pending") return "pending";
  if (transactionStatus === "expire" || transactionStatus === "cancel" || transactionStatus === "deny") return "failed";
  return "pending";
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

const snap = new midtransClient.Snap({
  isProduction: String(process.env.MIDTRANS_IS_PRODUCTION || "false").toLowerCase() === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY,
});

function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `ORD-${ts}-${rnd}`;
}

const queryAsync = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      return resolve(results);
    });
  });
};

exports.returnHandler = async (req, res) => {
  try {
    const orderId = String(req.query.order_id || "").trim();
    const result = String(req.query.result || "finish").trim();

    if (!orderId) {
      const fallback = buildFrontendPaymentReturnUrl({
        orderId: null,
        result,
        paymentStatus: "unknown",
        transactionStatus: null,
        statusCode: null,
        synced: 0,
      });
      if (!fallback) return res.status(400).send("order_id wajib");
      return res.redirect(fallback);
    }

    let midtransStatus = null;
    try {
      midtransStatus = await snap.transaction.status(orderId);
    } catch (err) {
      console.error("[MIDTRANS][RETURN] status error:", err);
    }

    let paymentStatus = "unknown";
    let synced = 0;
    let transactionStatus = null;
    let statusCode = null;

    if (midtransStatus) {
      transactionStatus = String(midtransStatus.transaction_status || "") || null;
      statusCode = String(midtransStatus.status_code || "") || null;
      paymentStatus = mapMidtransOrderStatus(transactionStatus);

      try {
        // store/update order_payments using same structure as notification
        const orderRows = await queryAsync("SELECT id, cafe_id FROM orders WHERE id = ? LIMIT 1", [orderId]);
        const order = orderRows && orderRows.length > 0 ? orderRows[0] : null;

        await queryAsync(
          `INSERT INTO order_payments
           (order_id, cafe_id, provider, status, transaction_status, payment_type, fraud_status, midtrans_transaction_id, raw_json)
           VALUES (?, ?, 'midtrans', ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             cafe_id = VALUES(cafe_id),
             status = VALUES(status),
             transaction_status = VALUES(transaction_status),
             payment_type = VALUES(payment_type),
             fraud_status = VALUES(fraud_status),
             midtrans_transaction_id = VALUES(midtrans_transaction_id),
             raw_json = VALUES(raw_json),
             updated_at = CURRENT_TIMESTAMP`,
          [
            orderId,
            order?.cafe_id || null,
            paymentStatus,
            transactionStatus,
            midtransStatus.payment_type || null,
            midtransStatus.fraud_status || null,
            midtransStatus.transaction_id || null,
            JSON.stringify(midtransStatus),
          ],
        );

        synced = 1;
      } catch (err) {
        console.error("[MIDTRANS][RETURN] sync error:", err);
      }
    }

    const redirectUrl = buildFrontendPaymentReturnUrl({
      orderId,
      result,
      paymentStatus,
      transactionStatus,
      statusCode,
      synced,
    });

    if (!redirectUrl) {
      return res.status(500).send("FRONTEND_BASE_URL belum diset");
    }

    return res.redirect(redirectUrl);
  } catch (err) {
    console.error("[MIDTRANS][RETURN] error:", err);
    return res.status(500).send("Terjadi kesalahan pada server");
  }
};

const getOrderById = async (orderId) => {
  const rows = await queryAsync("SELECT * FROM orders WHERE id = ?", [orderId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const getOrderItems = async (orderId) => {
  return await queryAsync(
    "SELECT nama_menu AS name, qty, harga AS price, catatan FROM order_items WHERE order_id = ?",
    [orderId],
  );
};

exports.createTransaction = async (req, res) => {
  try {
    console.log("[MIDTRANS][CREATE] body:", req.body);

    const existingOrderId = req.body.order_id ?? req.body.orderId;
    if (existingOrderId) {
      const existingOrder = await getOrderById(existingOrderId);
      if (!existingOrder) {
        return res.status(404).json({ error: "Terjadi masalah: order tidak ditemukan" });
      }
      const totalOrder = Number(existingOrder.total ?? 0);
      if (!Number.isFinite(totalOrder) || totalOrder <= 0) {
        return res.status(400).json({ error: "Terjadi masalah: total order tidak valid" });
      }

      const finishUrl = buildMidtransReturnUrl(req, existingOrderId, "finish");
      const unfinishUrl = buildMidtransReturnUrl(req, existingOrderId, "unfinish");
      const errorUrl = buildMidtransReturnUrl(req, existingOrderId, "error");

      const parameter = {
        transaction_details: {
          order_id: existingOrderId,
          gross_amount: parseInt(totalOrder, 10),
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

      // Simpan status pembayaran (pending) agar kasir bisa validasi cepat
      await queryAsync(
        `INSERT INTO order_payments (order_id, cafe_id, provider, status, raw_json)
         VALUES (?, ?, 'midtrans', 'pending', ?)
         ON DUPLICATE KEY UPDATE
           cafe_id = VALUES(cafe_id),
           provider = 'midtrans',
           status = 'pending',
           raw_json = VALUES(raw_json),
           updated_at = CURRENT_TIMESTAMP`,
        [existingOrderId, existingOrder.cafe_id || null, JSON.stringify({ token: transaction.token, redirect_url: transaction.redirect_url })],
      );

      return res.json({
        order_id: existingOrderId,
        subtotal: totalOrder,
        discount: 0,
        total: totalOrder,
        snap_token: transaction.token,
        redirect_url: transaction.redirect_url,
      });
    }

    const cafeId = req.body.cafe_id;
    const meja = req.body.meja ?? req.body.meja_id;
    const nama = req.body.nama ?? "";
    const note = req.body.note ?? "";
    const promoCode = req.body.promo_code ?? null;
    const items = req.body.items ?? [];

    if (!cafeId || !meja) {
      return res.status(400).json({ error: "Terjadi masalah: cafe_id dan meja wajib diisi" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Terjadi masalah: items tidak boleh kosong" });
    }

    const normalizedItems = items
      .map((it) => {
        const id = it.id ?? it.menu_id;
        const qty = Number(it.quantity ?? it.qty ?? 1);
        const catatan = it.catatan ?? it.note ?? "";
        return {
          id: id === undefined || id === null ? null : Number(id),
          qty,
          catatan,
        };
      })
      .filter((it) => Number.isFinite(it.id) && it.id > 0);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: "Terjadi masalah: item id tidak valid" });
    }
    if (normalizedItems.some((it) => !Number.isFinite(it.qty) || it.qty <= 0)) {
      return res.status(400).json({ error: "Terjadi masalah: quantity/qty harus angka" });
    }

    const uniqueMenuIds = Array.from(new Set(normalizedItems.map((it) => it.id)));
    const placeholders = uniqueMenuIds.map(() => "?").join(",");
    const menuRows = await queryAsync(
      `SELECT id, cafe_id, nama_menu, harga, status FROM menus WHERE cafe_id = ? AND id IN (${placeholders})`,
      [cafeId, ...uniqueMenuIds],
    );

    const menuMap = new Map((menuRows || []).map((m) => [Number(m.id), m]));
    const missingIds = uniqueMenuIds.filter((id) => !menuMap.has(id));
    if (missingIds.length > 0) {
      return res.status(400).json({ error: `Terjadi masalah: menu tidak ditemukan (${missingIds.join(",")})` });
    }

    const pricedItems = normalizedItems.map((it) => {
      const menu = menuMap.get(it.id);
      const price = Number(menu.harga ?? 0);
      return {
        id: it.id,
        name: menu.nama_menu,
        price,
        quantity: it.qty,
        catatan: it.catatan,
      };
    });

    const subtotal = pricedItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      return res.status(400).json({ error: "Terjadi masalah: subtotal tidak valid" });
    }

    let discount = 0;
    if (promoCode) {
      const promoRows = await queryAsync(
        `SELECT * FROM promo
         WHERE cafe_id = ? AND kode_promo = ?
           AND CURDATE() >= mulai_date AND CURDATE() <= berakhir_date
         LIMIT 1`,
        [cafeId, promoCode],
      );

      if (promoRows && promoRows.length > 0) {
        const promo = promoRows[0];
        const minimumOrder = Number(promo.minimum_order ?? 0);
        if (subtotal >= minimumOrder) {
          const nilai = Number(promo.nilai ?? 0);
          const tipeDiskon = Number(promo.tipe_diskon ?? 0);

          // Aturan: tipe_diskon = 1 => nominal (rupiah), tipe_diskon = 0 => persen
          const treatAsPercent = tipeDiskon === 0;
          const percentValue = Math.min(Math.max(nilai, 0), 100);
          discount = treatAsPercent ? Math.floor((subtotal * percentValue) / 100) : nilai;
          if (!Number.isFinite(discount) || discount < 0) discount = 0;
          if (discount > subtotal) discount = subtotal;
        }
      }
    }

    const total = subtotal - discount;
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({
        error: "Terjadi masalah: total tidak valid setelah diskon",
        debug: { subtotal, discount, promo_code: promoCode },
      });
    }

    const orderId = generateOrderId();

    await queryAsync(
      `INSERT INTO orders (id, cafe_id, meja, nama, status, total, note, method, estimasi)
       VALUES (?, ?, ?, ?, 'proses', ?, ?, 'online', '15 mnt')`,
      [orderId, cafeId, meja, nama, Number(total), note],
    );

    for (const it of pricedItems) {
      await queryAsync(
        `INSERT INTO order_items (order_id, nama_menu, qty, harga, catatan)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, it.name, it.quantity, Number(it.price), it.catatan || ""],
      );
    }

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: parseInt(total, 10),
      },
    };

    const finishUrl = buildMidtransReturnUrl(req, orderId, "finish");
    const unfinishUrl = buildMidtransReturnUrl(req, orderId, "unfinish");
    const errorUrl = buildMidtransReturnUrl(req, orderId, "error");

    if (finishUrl) {
      parameter.callbacks = {
        finish: finishUrl,
        unfinish: unfinishUrl,
        error: errorUrl,
      };
    }

    const transaction = await snap.createTransaction(parameter);

    return res.json({
      order_id: orderId,
      subtotal,
      discount,
      total,
      snap_token: transaction.token,
      redirect_url: transaction.redirect_url,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Terjadi masalah saat membuat transaksi" });
  }
};

exports.notification = async (req, res) => {
  try {
    const notification = req.body || {};

    const ok = verifyMidtransSignature(notification);
    if (!ok) {
      return res.status(401).json({ message: "Signature tidak valid" });
    }

    const orderId = notification.order_id;
    if (!orderId) return res.status(400).json({ message: "order_id wajib" });

    // Ambil order untuk cafe_id
    const orderRows = await queryAsync("SELECT id, cafe_id FROM orders WHERE id = ? LIMIT 1", [orderId]);
    const order = orderRows && orderRows.length > 0 ? orderRows[0] : null;

    const transactionStatus = String(notification.transaction_status || "");
    const mapped = mapMidtransOrderStatus(transactionStatus);

    await queryAsync(
      `INSERT INTO order_payments
       (order_id, cafe_id, provider, status, transaction_status, payment_type, fraud_status, midtrans_transaction_id, raw_json)
       VALUES (?, ?, 'midtrans', ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         cafe_id = VALUES(cafe_id),
         status = VALUES(status),
         transaction_status = VALUES(transaction_status),
         payment_type = VALUES(payment_type),
         fraud_status = VALUES(fraud_status),
         midtrans_transaction_id = VALUES(midtrans_transaction_id),
         raw_json = VALUES(raw_json),
         updated_at = CURRENT_TIMESTAMP`,
      [
        orderId,
        order?.cafe_id || null,
        mapped,
        transactionStatus || null,
        notification.payment_type || null,
        notification.fraud_status || null,
        notification.transaction_id || null,
        JSON.stringify(notification),
      ],
    );

    return res.status(200).json({ received: true, status: mapped });
  } catch (err) {
    console.error("[MIDTRANS][NOTIF] error:", err);
    const pub = toPublicError(err, "Terjadi kesalahan pada server");
    return res.status(pub.status).json({ message: pub.message });
  }
};

exports.checkStatus = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const status = await snap.transaction.status(orderId);
    const transactionStatus = String(status?.transaction_status || "") || null;
    const mapped = mapMidtransOrderStatus(transactionStatus);

    let local = null;
    try {
      const rows = await queryAsync("SELECT * FROM order_payments WHERE order_id = ? LIMIT 1", [orderId]);
      local = rows && rows.length > 0 ? rows[0] : null;
    } catch (_) {
      local = null;
    }

    return res.json({
      order_id: orderId,
      payment_status: mapped,
      transaction_status: transactionStatus,
      status_code: status?.status_code || null,
      raw_midtrans: status,
      local_payment: local,
    });
  } catch (err) {
    console.log("ERROE MIDTRANS:", err);
    return res.status(500).json({ error: "Terjadi masalah saat cek status" });
  }
};
