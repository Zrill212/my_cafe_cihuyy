// controllers/OrderController.js
const db = require("../config/db");
const QRCode = require("qrcode");
const { toPublicError } = require("../utils/publicError");
const midtransClient = require("midtrans-client");

const isMidtransProduction = () => {
  const raw = String(process.env.MIDTRANS_IS_PRODUCTION || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "y";
};

const snap = new midtransClient.Snap({
  isProduction: isMidtransProduction(),
  serverKey: process.env.MIDTRANS_SERVER_KEY,
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status:  httpStatus,
    message,
    data,
    success: httpStatus >= 200 && httpStatus < 300,
  });
};

function mapMidtransOrderStatus(transactionStatus) {
  if (transactionStatus === "settlement" || transactionStatus === "capture") return "paid";
  if (transactionStatus === "pending") return "pending";
  if (transactionStatus === "expire" || transactionStatus === "cancel" || transactionStatus === "deny") {
    return "failed";
  }
  return "pending";
}

async function upsertOrderPaymentFromMidtransStatus(orderId, cafeId, midtransStatus) {
  if (!orderId) return null;

  const transactionStatus = String(midtransStatus?.transaction_status || "");
  const mapped = mapMidtransOrderStatus(transactionStatus);

  await new Promise((resolve) => {
    db.query(
      `INSERT INTO order_payments
       (order_id, cafe_id, provider, status, transaction_status, payment_type, fraud_status, midtrans_transaction_id, raw_json)
       VALUES (?, ?, 'midtrans', ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         transaction_status = VALUES(transaction_status),
         payment_type = VALUES(payment_type),
         fraud_status = VALUES(fraud_status),
         midtrans_transaction_id = VALUES(midtrans_transaction_id),
         raw_json = VALUES(raw_json),
         updated_at = CURRENT_TIMESTAMP`,
      [
        orderId,
        cafeId || null,
        mapped,
        transactionStatus || null,
        midtransStatus?.payment_type || null,
        midtransStatus?.fraud_status || null,
        midtransStatus?.transaction_id || null,
        JSON.stringify(midtransStatus || {}),
      ],
      () => resolve(),
    );
  });

  return mapped;
};

function generateOrderId() {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `ORD-${ts}-${rnd}`;
}

function formatWaktu(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  });
}

function formatTanggal(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
  });
}

function formatOrder(o, items) {
  const itemNotes = {};
  items.forEach(i => { if (i.item_note) itemNotes[i.name] = i.item_note; });
  return {
    id:         o.id,
    cafe_id:    o.cafe_id,
    meja:       o.meja,
    nama:       o.nama     ?? "",
    status:     o.status   ?? "proses",
    total:      Number(o.total ?? 0),
    note:       o.note     ?? "",
    method:     o.method   ?? "online",
    estimasi:   o.estimasi ?? "15 mnt",
    waktu:      formatWaktu(o.created_at),
    tanggal:    formatTanggal(o.created_at),
    created_at: o.created_at,
    itemNotes,
    items: items.map(i => ({
      name:  i.name  ?? "",
      qty:   Number(i.qty   ?? 1),
      price: Number(i.price ?? 0),
      image: i.image ?? "",
    })),
  };
}

// Ambil items dari order_id, dengan fallback kalau JOIN gagal
function fetchItems(orderId, cafeId, callback) {
  const sql = `
    SELECT
      oi.nama_menu AS name,
      oi.qty,
      oi.harga    AS price,
      oi.catatan  AS item_note,
      COALESCE(m.image_url, '') AS image
    FROM order_items oi
    LEFT JOIN menus m
      ON m.nama_menu = oi.nama_menu
      AND m.cafe_id = ?
    WHERE oi.order_id = ?`;

  db.query(sql, [cafeId, orderId], (err, items) => {
    if (err) {
      // Fallback tanpa JOIN
      db.query(
        `SELECT nama_menu AS name, qty, harga AS price, catatan AS item_note, '' AS image
         FROM order_items WHERE order_id = ?`,
        [orderId],
        (err2, items2) => {
          callback(err2, items2 || []);
        }
      );
    } else {
      callback(null, items || []);
    }
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN
   ══════════════════════════════════════════════════════════════════════════ */

// GET /api/orders/admin/midtrans-balance
exports.adminGetMidtransBalance = (req, res) => {
  const cafe_id = req.user?.cafe_id;
  if (!cafe_id) return sendResponse(res, 401, "Unauthorized", null);

  db.query(
    `SELECT
       COALESCE(SUM(total), 0) as total_amount,
       COUNT(*) as total_orders
     FROM orders
     WHERE cafe_id = ? AND status = 'selesai' AND method = 'online'`,
    [cafe_id],
    (err, rows) => {
      if (err) {
        const pub = toPublicError(err, "Gagal mengambil saldo Midtrans");
        return sendResponse(res, pub.status, pub.message, null);
      }

      const row = rows && rows.length > 0 ? rows[0] : {};
      return sendResponse(res, 200, "Berhasil mengambil saldo Midtrans", {
        cafe_id,
        total_amount: Number(row.total_amount || 0),
        total_orders: Number(row.total_orders || 0),
      });
    },
  );
};

// GET /api/orders/kasir
// List untuk terminal kasir:
// - status=aktif => order belum selesai dan sudah dibayar (online/kasir)
// - status=selesai => order yang sudah ditekan tandai selesai
exports.kasirGetList = (req, res) => {
  const cafe_id = req.user?.cafe_id;
  if (!cafe_id) return sendResponse(res, 401, "Unauthorized", []);

  const { status, limit = 200 } = req.query;
  const maxLimit = Math.min(Number(limit || 200), 500);

  let sql = `
    SELECT o.*
    FROM orders o
    LEFT JOIN order_payments op ON op.order_id = o.id
    WHERE o.cafe_id = ?`;
  const vals = [cafe_id];

  if (status === "selesai") {
    sql += ` AND o.status = 'selesai'`;
  } else if (status === "aktif") {
    sql += `
      AND o.status <> 'selesai'
      AND (
        (LOWER(o.method) = 'online' AND op.status = 'paid')
        OR
        (LOWER(o.method) = 'kasir' AND op.status = 'paid')
      )`;
  } else if (status) {
    // kompatibilitas lama: proses/selesai
    sql += ` AND o.status = ?`;
    vals.push(status);
  }

  sql += ` ORDER BY o.created_at DESC LIMIT ?`;
  vals.push(maxLimit);

  db.query(sql, vals, (err, orders) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil data pesanan");
      return sendResponse(res, pub.status, pub.message, []);
    }
    if (!orders || orders.length === 0) {
      return sendResponse(res, 200, "Berhasil mengambil data pesanan", []);
    }

    let done = 0;
    const result = [];

    orders.forEach((o, idx) => {
      fetchItems(o.id, cafe_id, (err2, items) => {
        result[idx] = formatOrder(o, items || []);
        done++;
        if (done === orders.length) {
          return sendResponse(res, 200, "Berhasil mengambil data pesanan", result);
        }
      });
    });
  });
};

// GET /api/orders/admin
exports.adminGetAll = (req, res) => {
  const cafe_id = req.user.cafe_id;
  const { status, meja, limit = 50, page = 1 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let sql    = `SELECT * FROM orders WHERE cafe_id = ?`;
  const vals = [cafe_id];

  if (status) { sql += ` AND status = ?`; vals.push(status); }
  if (meja)   { sql += ` AND meja = ?`;   vals.push(meja); }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  vals.push(Number(limit), Number(offset));

  db.query(sql, vals, (err, orders) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil data pesanan");
      return sendResponse(res, pub.status, pub.message, []);
    }
    if (!orders || orders.length === 0) {
      return sendResponse(res, 200, "Berhasil mengambil data pesanan", []);
    }

    // Ambil items untuk setiap order
    let done = 0;
    const result = [];

    orders.forEach((o, idx) => {
      fetchItems(o.id, cafe_id, (err2, items) => {
        result[idx] = formatOrder(o, items || []);
        done++;
        if (done === orders.length) {
          return sendResponse(res, 200, "Berhasil mengambil data pesanan", result);
        }
      });
    });
  });
};

// GET /api/orders/admin/:id
exports.adminGetOne = (req, res) => {
  const cafe_id = req.user.cafe_id;

  db.query(
    `SELECT * FROM orders WHERE id = ? AND cafe_id = ?`,
    [req.params.id, cafe_id],
    (err, rows) => {
      if (err) {
        const pub = toPublicError(err, "Gagal mengambil pesanan");
        return sendResponse(res, pub.status, pub.message, null);
      }
      if (!rows || rows.length === 0) return sendResponse(res, 404, "Pesanan tidak ditemukan", null);

      const order = rows[0];
      fetchItems(order.id, cafe_id, (err2, items) => {
        return sendResponse(res, 200, "Berhasil", formatOrder(order, items || []));
      });
    }
  );
};

// PATCH /api/orders/admin/:id/status
exports.adminUpdateStatus = (req, res) => {
  const cafe_id    = req.user.cafe_id;
  const { id }     = req.params;
  const { status } = req.body;

  const allowed = ["proses", "selesai"];
  if (!allowed.includes(status)) {
    return sendResponse(res, 400, `Status harus: ${allowed.join(", ")}`, null);
  }

  db.query(
    `SELECT id, cafe_id FROM orders WHERE id = ?`, [id],
    (err, rows) => {
      if (err) {
        const pub = toPublicError(err, "Gagal mengambil pesanan");
        return sendResponse(res, pub.status, pub.message, null);
      }
      if (!rows || rows.length === 0 || String(rows[0].cafe_id) !== String(cafe_id)) {
        return sendResponse(res, 404, "Pesanan tidak ditemukan", null);
      }

      db.query(
        `SELECT id, cafe_id, method FROM orders WHERE id = ? LIMIT 1`,
        [id],
        async (mErr, orderRows) => {
          if (mErr) {
            const pub = toPublicError(mErr, "Gagal mengambil pesanan");
            return sendResponse(res, pub.status, pub.message, null);
          }
          const order = orderRows && orderRows.length > 0 ? orderRows[0] : null;
          if (!order) return sendResponse(res, 404, "Pesanan tidak ditemukan", null);

          if (status === "selesai" && String(order.method || "").toLowerCase() === "online") {
            if (!process.env.MIDTRANS_SERVER_KEY) {
              return sendResponse(res, 500, "MIDTRANS_SERVER_KEY belum diset", null);
            }

            let st = null;
            try {
              st = await snap.transaction.status(id);
            } catch (e) {
              return sendResponse(res, 400, "Gagal cek status pembayaran online", {
                reason: "midtrans_status_check_failed",
              });
            }

            const mapped = await upsertOrderPaymentFromMidtransStatus(id, cafe_id, st);
            if (mapped !== "paid") {
              return sendResponse(res, 403, "Pembayaran online belum berhasil", {
                reason: "payment_not_paid",
                transaction_status: st?.transaction_status || null,
              });
            }
          }

          db.query(
            `UPDATE orders SET status = ? WHERE id = ?`,
            [status, id],
            (err2) => {
              if (err2) {
                const pub = toPublicError(err2, "Gagal update status");
                return sendResponse(res, pub.status, pub.message, null);
              }
              return sendResponse(res, 200, `Status diupdate ke '${status}'`, { id, status });
            },
          );
        },
      );
    }
  );
};

// DELETE /api/orders/admin/:id
exports.adminDelete = (req, res) => {
  const cafe_id = req.user.cafe_id;

  db.query(
    `SELECT id, cafe_id FROM orders WHERE id = ?`, [req.params.id],
    (err, rows) => {
      if (err) {
        const pub = toPublicError(err, "Gagal menghapus pesanan");
        return sendResponse(res, pub.status, pub.message, null);
      }
      if (!rows || rows.length === 0 || String(rows[0].cafe_id) !== String(cafe_id)) {
        return sendResponse(res, 404, "Pesanan tidak ditemukan", null);
      }

      db.query(`DELETE FROM order_items WHERE order_id = ?`, [req.params.id], (err2) => {
        if (err2) {
          const pub = toPublicError(err2, "Gagal menghapus pesanan");
          return sendResponse(res, pub.status, pub.message, null);
        }

        db.query(`DELETE FROM orders WHERE id = ?`, [req.params.id], (err3) => {
          if (err3) {
            const pub = toPublicError(err3, "Gagal menghapus pesanan");
            return sendResponse(res, pub.status, pub.message, null);
          }
          return sendResponse(res, 200, "Pesanan dihapus", {});
        });
      });
    }
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   USER / PELANGGAN
   ══════════════════════════════════════════════════════════════════════════ */

// POST /api/orders
exports.userCreate = (req, res) => {
  const {
    cafe_id,
    meja,
    nama     = "",
    total    = 0,
    note     = "",
    method   = "online",
    estimasi = "15 mnt",
    items    = [],
  } = req.body;

  if (!cafe_id || !meja) {
    return sendResponse(res, 400, "cafe_id dan meja wajib diisi", null);
  }
  if (!items || items.length === 0) {
    return sendResponse(res, 400, "Items tidak boleh kosong", null);
  }

  const orderId = generateOrderId();

  const visitorId = req.clientMeta?.visitor_id || null;
  const fingerprint = req.clientMeta?.fingerprint || null;

  if (!fingerprint) {
    return sendResponse(
      res,
      400,
      "Perangkat belum terverifikasi. Silakan coba lagi.",
      {
        required: "fingerprint",
        hint: "Kirim fingerprint via header 'x-fingerprint' atau field body 'fingerprint' sebelum membuat pesanan.",
      },
    );
  }

  db.query(
    `INSERT INTO orders (id, cafe_id, meja, nama, status, total, note, method, estimasi)
     VALUES (?, ?, ?, ?, 'proses', ?, ?, ?, ?)`,
    [orderId, cafe_id, meja, nama, Number(total), note, method, estimasi],
    (err) => {
      if (err) {
        console.error("userCreate insert order:", err);
        const pub = toPublicError(err, "Gagal membuat pesanan");
        return sendResponse(res, pub.status, pub.message, null);
      }

      // Insert items satu per satu
      let idx = 0;

      const insertNext = () => {
        if (idx >= items.length) {
          return db.query(
            `INSERT INTO riwayat_pembelian (order_id, cafe_id, visitor_id, fingerprint)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               visitor_id = COALESCE(visitor_id, VALUES(visitor_id)),
               fingerprint = COALESCE(fingerprint, VALUES(fingerprint))`,
            [orderId, cafe_id, visitorId, fingerprint],
            (rbErr) => {
              if (rbErr) {
                console.error("userCreate insert riwayat_pembelian:", rbErr);
              }

              return QRCode.toDataURL(orderId, (qrErr, qrCodeDataUrl) => {
                return sendResponse(res, 201, "Pesanan berhasil dibuat", {
                  id:       orderId,
                  status:   "proses",
                  waktu:    formatWaktu(),
                  tanggal:  formatTanggal(),
                  estimasi,
                  qr_code:  qrErr ? null : qrCodeDataUrl,
                });
              });
            },
          );
        }

        const item     = items[idx++];
        if (!item) return setImmediate(insertNext);
        const namaMenu = item.nama_menu ?? item.name ?? item.nama ?? "";
        const qty      = Number(item.qty ?? item.jumlah ?? 1);
        const harga    = Number(item.harga ?? item.price ?? 0);
        const catatan  = item.catatan ?? item.note ?? item.keterangan ?? "";

        if (!namaMenu) return setImmediate(insertNext); // skip item kosong

        db.query(
          `INSERT INTO order_items (order_id, nama_menu, qty, harga, catatan)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, namaMenu, qty, harga, catatan],
          (err2) => {
            if (err2) {
              console.error("userCreate insert item:", err2);
              // Lanjut meski satu item gagal
              return setImmediate(insertNext);
            }
            return setImmediate(insertNext);
          },
        );
      };

      insertNext();
    }
  );
};

// GET /api/orders?cafe_id=1&meja=3
exports.userGetByMeja = (req, res) => {
  const { cafe_id, meja, status } = req.query;

  if (!cafe_id || !meja) {
    return sendResponse(res, 400, "cafe_id dan meja wajib diisi", null);
  }

  let sql    = `SELECT * FROM orders WHERE cafe_id = ? AND meja = ?`;
  const vals = [cafe_id, meja];

  if (status) { sql += ` AND status = ?`; vals.push(status); }
  sql += ` ORDER BY created_at DESC LIMIT 20`;

  db.query(sql, vals, (err, orders) => {
    if (err) {
      console.error("userGetByMeja:", err);
      const pub = toPublicError(err, "Gagal mengambil riwayat pesanan");
      return sendResponse(res, pub.status, pub.message, []);
    }

    // Kalau kosong return array kosong, bukan error
    if (!orders || orders.length === 0) {
      return sendResponse(res, 200, "Berhasil mengambil riwayat pesanan", []);
    }

    let done = 0;
    const result = [];

    orders.forEach((o, idx) => {
      fetchItems(o.id, cafe_id, (err2, items) => {
        result[idx] = formatOrder(o, items || []);
        done++;
        if (done === orders.length) {
          return sendResponse(res, 200, "Berhasil mengambil riwayat pesanan", result);
        }
      });
    });
  });
};

// GET /api/orders/:id/status
exports.userGetStatus = (req, res) => {
  const orderId = req.params.id;

  db.query(
    "SELECT id, cafe_id, meja, status, total, method, created_at FROM orders WHERE id = ? LIMIT 1",
    [orderId],
    (err, rows) => {
      if (err) {
        const pub = toPublicError(err, "Gagal mengambil status pesanan");
        return sendResponse(res, pub.status, pub.message, null);
      }
      if (!rows || rows.length === 0) return sendResponse(res, 404, "Pesanan tidak ditemukan", null);

      const o = rows[0];
      return QRCode.toDataURL(String(o.id), (qrErr, qrCodeDataUrl) => {
        return sendResponse(res, 200, "Berhasil mengambil status pesanan", {
          id: o.id,
          cafe_id: o.cafe_id,
          meja: o.meja,
          status: o.status,
          total: Number(o.total ?? 0),
          method: o.method,
          created_at: o.created_at,
          qr_code: qrErr ? null : qrCodeDataUrl,
        });
      });
    },
  );
};

// GET /api/orders/:id
exports.userGetOne = (req, res) => {
  db.query(
    `SELECT * FROM orders WHERE id = ?`, [req.params.id],
    (err, rows) => {
      if (err) {
        const pub = toPublicError(err, "Gagal mengambil pesanan");
        return sendResponse(res, pub.status, pub.message, null);
      }
      if (!rows || rows.length === 0) return sendResponse(res, 404, "Pesanan tidak ditemukan", null);

      const order = rows[0];
      fetchItems(order.id, order.cafe_id, (err2, items) => {
        const payload = formatOrder(order, items || []);
        return QRCode.toDataURL(String(order.id), (qrErr, qrCodeDataUrl) => {
          return sendResponse(res, 200, "Berhasil", {
            ...payload,
            qr_code: qrErr ? null : qrCodeDataUrl,
          });
        });
      });
    }
  );
};

// controller/ordersController.js

exports.getOrders = async (req, res) => {
  try {
    const { device_id, cafe_id, meja } = req.query;
    let query = "SELECT * FROM orders WHERE 1=1";
    const params = [];

    if (device_id) { query += " AND device_id = ?"; params.push(device_id); }
    if (cafe_id) { query += " AND cafe_id = ?"; params.push(cafe_id); }
    if (meja) { query += " AND meja_id = ?"; params.push(meja); }

    query += " ORDER BY created_at DESC";

    const [orders] = await db.execute(query, params);
    res.json({ success: true, data: orders });
  } catch (error) {
    const pub = toPublicError(error, "Gagal mengambil data orders");
    res.status(pub.status).json({ success: false, message: pub.message });
  }
};

// PATCH /api/orders/kasir/:id/status
// Dipanggil oleh terminal kasir — verifikasi cafe_id dari token JWT
exports.kasirUpdateStatus = (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;
  const cafe_id    = req.user?.cafe_id;

  // Status yang boleh diset oleh kasir
  const allowed = ["proses", "selesai", "siap", "lunas"];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Status tidak valid. Pilihan: ${allowed.join(", ")}`,
    });
  }

  // Cek order exist — tanpa filter cafe_id agar kasir bisa akses semua order cafe-nya
  db.query(
    `SELECT id, cafe_id, status FROM orders WHERE id = ? LIMIT 1`,
    [id],
    (err, rows) => {
      if (err) {
        const pub = toPublicError(err, "Gagal mengambil pesanan");
        return res.status(pub.status).json({ success: false, message: pub.message });
      }
      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
      }

      // Opsional: pastikan order milik cafe yang sama dengan kasir
      if (cafe_id && String(rows[0].cafe_id) !== String(cafe_id)) {
        return res.status(403).json({ success: false, message: "Akses ditolak: bukan order cafe ini" });
      }

      db.query(
        `SELECT id, cafe_id, method FROM orders WHERE id = ? LIMIT 1`,
        [id],
        async (mErr, orderRows) => {
          if (mErr) {
            const pub = toPublicError(mErr, "Gagal mengambil pesanan");
            return res.status(pub.status).json({ success: false, message: pub.message });
          }
          const order = orderRows && orderRows.length > 0 ? orderRows[0] : null;
          if (!order) {
            return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
          }

          if (status === "selesai" && String(order.method || "").toLowerCase() === "online") {
            if (!process.env.MIDTRANS_SERVER_KEY) {
              return res.status(500).json({ success: false, message: "MIDTRANS_SERVER_KEY belum diset" });
            }

            let st = null;
            try {
              st = await snap.transaction.status(id);
            } catch (e) {
              return res.status(400).json({
                success: false,
                message: "Gagal cek status pembayaran online",
                reason: "midtrans_status_check_failed",
              });
            }

            const mapped = await upsertOrderPaymentFromMidtransStatus(id, cafe_id, st);
            if (mapped !== "paid") {
              return res.status(403).json({
                success: false,
                message: "Pembayaran online belum berhasil",
                reason: "payment_not_paid",
                transaction_status: st?.transaction_status || null,
              });
            }
          }

          db.query(
            `UPDATE orders SET status = ? WHERE id = ?`,
            [status, id],
            (err2) => {
              if (err2) {
                const pub = toPublicError(err2, "Gagal update status");
                return res.status(pub.status).json({ success: false, message: pub.message });
              }
              return res.status(200).json({
                success: true,
                message: `Status pesanan diupdate ke '${status}'`,
                data: { id, status },
              });
            },
          );
        },
      );
    }
  );
};