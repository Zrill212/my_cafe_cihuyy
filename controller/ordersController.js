// controllers/OrderController.js
const db = require("../config/db");

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status:  httpStatus,
    message,
    data,
    success: httpStatus >= 200 && httpStatus < 300,
  });
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
      return sendResponse(res, 500, err.message, []);
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
      if (err) return sendResponse(res, 500, err.message, null);
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
      if (err) return sendResponse(res, 500, err.message, null);
      if (!rows || rows.length === 0 || String(rows[0].cafe_id) !== String(cafe_id)) {
        return sendResponse(res, 404, "Pesanan tidak ditemukan", null);
      }

      db.query(
        `UPDATE orders SET status = ? WHERE id = ?`, [status, id],
        (err2) => {
          if (err2) return sendResponse(res, 500, err2.message, null);
          return sendResponse(res, 200, `Status diupdate ke '${status}'`, { id, status });
        }
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
      if (err) return sendResponse(res, 500, err.message, null);
      if (!rows || rows.length === 0 || String(rows[0].cafe_id) !== String(cafe_id)) {
        return sendResponse(res, 404, "Pesanan tidak ditemukan", null);
      }

      db.query(`DELETE FROM order_items WHERE order_id = ?`, [req.params.id], (err2) => {
        if (err2) return sendResponse(res, 500, err2.message, null);

        db.query(`DELETE FROM orders WHERE id = ?`, [req.params.id], (err3) => {
          if (err3) return sendResponse(res, 500, err3.message, null);
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

  db.query(
    `INSERT INTO orders (id, cafe_id, meja, nama, status, total, note, method, estimasi)
     VALUES (?, ?, ?, ?, 'proses', ?, ?, ?, ?)`,
    [orderId, cafe_id, meja, nama, Number(total), note, method, estimasi],
    (err) => {
      if (err) {
        console.error("userCreate insert order:", err);
        return sendResponse(res, 500, err.sqlMessage || err.message, null);
      }

      // Insert items satu per satu
      let idx = 0;

      const insertNext = () => {
        if (idx >= items.length) {
          // Semua item selesai
          return sendResponse(res, 201, "Pesanan berhasil dibuat", {
            id:       orderId,
            status:   "proses",
            waktu:    formatWaktu(),
            tanggal:  formatTanggal(),
            estimasi,
          });
        }

        const item     = items[idx++];
        const namaMenu = item.nama_menu ?? item.name ?? item.nama ?? "";
        const qty      = Number(item.qty ?? item.jumlah ?? 1);
        const harga    = Number(item.harga ?? item.price ?? 0);
        const catatan  = item.catatan ?? item.note ?? item.keterangan ?? "";

        if (!namaMenu) return insertNext(); // skip item kosong

        db.query(
          `INSERT INTO order_items (order_id, nama_menu, qty, harga, catatan)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, namaMenu, qty, harga, catatan],
          (err2) => {
            if (err2) {
              console.error("userCreate insert item:", err2);
              // Lanjut meski satu item gagal
            }
            insertNext();
          }
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
      return sendResponse(res, 500, err.message, []);
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

// GET /api/orders/:id
exports.userGetOne = (req, res) => {
  db.query(
    `SELECT * FROM orders WHERE id = ?`, [req.params.id],
    (err, rows) => {
      if (err) return sendResponse(res, 500, err.message, null);
      if (!rows || rows.length === 0) return sendResponse(res, 404, "Pesanan tidak ditemukan", null);

      const order = rows[0];
      fetchItems(order.id, order.cafe_id, (err2, items) => {
        return sendResponse(res, 200, "Berhasil", formatOrder(order, items || []));
      });
    }
  );
};