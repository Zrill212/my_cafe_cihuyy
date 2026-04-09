const db = require("../config/db");
const bcrypt = require("bcryptjs");
const util = require("util");
const { toPublicError } = require("../utils/publicError");

const query = util.promisify(db.query).bind(db);

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

const ensureAdmin = (req, res) => {
  const requesterRole = req.user?.role;
  if (requesterRole !== "admin") {
    sendResponse(res, 403, "Hanya admin yang boleh mengakses fitur kasir", []);
    return false;
  }
  return true;
};

const omitPassword = (row) => {
  if (!row) return row;
  const { password, ...safe } = row;
  return safe;
};

const upsertCafeSaldoTransaction = async ({ cafeId, orderId, amount, paymentMethod }) => {
  await query(
    `INSERT INTO cafe_saldo_transactions (cafe_id, order_id, amount, payment_method)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cafe_id = VALUES(cafe_id),
       amount = VALUES(amount),
       payment_method = VALUES(payment_method)`,
    [cafeId, orderId, Number(amount || 0), paymentMethod || "tunai"],
  );
};

const ensureKasirOrAdmin = (req, res) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "kasir") {
    sendResponse(res, 403, "Akses ditolak", []);
    return false;
  }
  return true;
};

const checkEmailKasirConflict = async ({ email, cafeId, excludeKasirId }) => {
  if (!email) return null;

  const existingKasirs = await query(
    "SELECT id, cafe_id FROM kasirs WHERE email = ? LIMIT 1",
    [email],
  );

  if (existingKasirs && existingKasirs.length > 0) {
    const row = existingKasirs[0];
    if (excludeKasirId && String(row.id) === String(excludeKasirId)) {
      return null;
    }
    if (String(row.cafe_id) !== String(cafeId)) {
      return { status: 409, message: "Sudah dipakai oleh cafe lain" };
    }
    return { status: 409, message: "Email sudah terdaftar di cafe ini" };
  }

  const existingAdmins = await query(
    "SELECT id, cafe_id FROM admins WHERE email = ? LIMIT 1",
    [email],
  );

  if (existingAdmins && existingAdmins.length > 0) {
    const row = existingAdmins[0];
    if (String(row.cafe_id) !== String(cafeId)) {
      return { status: 409, message: "Sudah dipakai oleh cafe lain" };
    }
    return { status: 409, message: "Email sudah terdaftar di cafe ini" };
  }

  return null;
};

exports.createKasir = async (req, res) => {
  const { username, email, password } = req.body;
  const cafeId = req.user.cafe_id;

  if (!username || !email || !password)
    return res.status(400).json({ message: "Semua field wajib diisi" });

  try {
    const conflict = await checkEmailKasirConflict({ email, cafeId });
    if (conflict) return res.status(conflict.status).json({ message: conflict.message });

    const passwordHash = bcrypt.hashSync(password, 10);

    const result = await query(
      "INSERT INTO kasirs (cafe_id, username, email, password) VALUES (?, ?, ?, ?)",
      [cafeId, username, email, passwordHash]
    );

    return res.status(201).json({
      message: "Kasir berhasil ditambahkan",
      id: result.insertId
    });
  } catch (err) {
    const pub = toPublicError(err, "Gagal menambahkan kasir");
    return res.status(pub.status).json({ message: pub.message });
  }
};

exports.getOrderPaymentDetail = async (req, res) => {
  if (!ensureKasirOrAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;
  const orderId = req.body?.order_id || req.params?.order_id;

  if (!orderId) {
    return sendResponse(res, 400, "order_id wajib diisi", []);
  }

  try {

    const orderRows = await query(
      "SELECT id, cafe_id, meja, nama, status, total, note, method, estimasi, created_at FROM orders WHERE id = ? AND cafe_id = ? LIMIT 1",
      [orderId, cafeId]
    );

    if (!orderRows || orderRows.length === 0) {
      return sendResponse(res, 404, "Order tidak ditemukan", []);
    }

    const items = await query(
      "SELECT nama_menu, qty, harga, catatan FROM order_items WHERE order_id = ?",
      [orderId]
    );

    const normalizedItems = (items || []).map((it) => {
      const qty = Number(it.qty ?? 0);
      const harga = Number(it.harga ?? 0);

      return {
        nama_menu: it.nama_menu,
        qty,
        harga,
        subtotal: qty * harga,
        catatan: it.catatan ?? "",
      };
    });

    const items_total = normalizedItems.reduce(
      (sum, it) => sum + Number(it.subtotal || 0),
      0
    );

    const order_total = Number(orderRows[0]?.total ?? 0);
    const total_bayar = order_total > 0 ? order_total : items_total;

    return sendResponse(res, 200, "Berhasil mengambil detail pembayaran", {
      order: {
        ...orderRows[0],
        total: order_total,
      },
      items: normalizedItems,
      items_total,
      total_bayar,
    });

  } catch (err) {
    const pub = toPublicError(err, "Gagal mengambil detail pembayaran");
    return sendResponse(res, pub.status, pub.message, []);
  }
};

exports.getKasirs = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;

  try {
    const rows = await query(
      "SELECT id, cafe_id, username, email FROM kasirs WHERE cafe_id = ? ORDER BY id DESC",
      [cafeId],
    );

    return sendResponse(res, 200, "Berhasil mengambil data kasir", rows || []);

  } catch (err) {
    const pub = toPublicError(err, "Gagal mengambil data kasir");
    return sendResponse(res, pub.status, pub.message, []);
  }
};

exports.getKasirById = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  try {

    const rows = await query(
      "SELECT * FROM kasirs WHERE id = ? AND cafe_id = ? LIMIT 1",
      [id, cafeId]
    );

    if (!rows || rows.length === 0) {
      return sendResponse(res, 404, "Kasir tidak ditemukan", []);
    }

    return sendResponse(res, 200, "Berhasil mengambil detail kasir", omitPassword(rows[0]));

  } catch (err) {
    const pub = toPublicError(err, "Gagal mengambil detail kasir");
    return sendResponse(res, pub.status, pub.message, []);
  }
};

exports.updateKasir = async (req, res) => {

  if (!ensureAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  const { username, email, password } = req.body;

  if (!username && !email && !password) {
    return sendResponse(res, 400, "Minimal isi salah satu: username, email, password", []);
  }

  try {

    const existing = await query(
      "SELECT id FROM kasirs WHERE id = ? AND cafe_id = ? LIMIT 1",
      [id, cafeId]
    );

    if (!existing || existing.length === 0) {
      return sendResponse(res, 404, "Kasir tidak ditemukan", []);
    }

    if (email) {
      const conflict = await checkEmailKasirConflict({ email, cafeId, excludeKasirId: id });
      if (conflict) return sendResponse(res, conflict.status, conflict.message, []);
    }

    const fields = [];
    const values = [];

    if (username) {
      fields.push("username = ?");
      values.push(username);
    }

    if (email) {
      fields.push("email = ?");
      values.push(email);
    }

    if (password) {
      const passwordHash = bcrypt.hashSync(password, 10);
      fields.push("password = ?");
      values.push(passwordHash);
    }

    values.push(id, cafeId);

    await query(
      `UPDATE kasirs SET ${fields.join(", ")} WHERE id = ? AND cafe_id = ?`,
      values
    );

    return sendResponse(res, 200, "Kasir berhasil diupdate", { id: parseInt(id) });

  } catch (err) {
    const pub = toPublicError(err, "Gagal update kasir");
    return sendResponse(res, pub.status, pub.message, []);
  }
};

exports.deleteKasir = async (req, res) => {

  if (!ensureAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  try {

    const result = await query(
      "DELETE FROM kasirs WHERE id = ? AND cafe_id = ?",
      [id, cafeId]
    );

    if (!result || result.affectedRows === 0) {
      return sendResponse(res, 404, "Kasir tidak ditemukan", []);
    }

    return sendResponse(res, 200, "Kasir berhasil dihapus", { id: parseInt(id) });

  } catch (err) {
    const pub = toPublicError(err, "Gagal hapus kasir");
    return sendResponse(res, pub.status, pub.message, []);
  }

  
};

exports.payOrder = async (req, res) => {

  const cafeId = req.user?.cafe_id;
  const orderId = req.body?.order_id || req.params?.order_id;
  const { method } = req.body;

  if (!orderId || !method) {
    return sendResponse(res, 400, "order_id dan method wajib diisi", []);
  }

  try {
    const orderRows = await query(
      "SELECT id, cafe_id, total FROM orders WHERE id = ? AND cafe_id = ? LIMIT 1",
      [orderId, cafeId],
    );
    const order = orderRows && orderRows.length > 0 ? orderRows[0] : null;
    if (!order) {
      return sendResponse(res, 404, "Order tidak ditemukan", []);
    }

    const result = await query(
      "UPDATE orders SET method = ? WHERE id = ? AND cafe_id = ?",
      [method, orderId, cafeId]
    );

    if (result.affectedRows === 0) {
      return sendResponse(res, 404, "Order tidak ditemukan", []);
    }

    await query(
      `INSERT INTO order_payments
       (order_id, cafe_id, provider, status, transaction_status, raw_json)
       VALUES (?, ?, 'kasir', 'paid', 'paid', ?)
       ON DUPLICATE KEY UPDATE
         cafe_id = VALUES(cafe_id),
         provider = 'kasir',
         status = 'paid',
         transaction_status = 'paid',
         raw_json = VALUES(raw_json),
         updated_at = CURRENT_TIMESTAMP`,
      [orderId, cafeId, JSON.stringify({ paid_at: new Date().toISOString(), method })],
    );

    await upsertCafeSaldoTransaction({
      cafeId,
      orderId,
      amount: order.total,
      paymentMethod: method,
    });

    return sendResponse(res, 200, "Pembayaran berhasil", {
      order_id: orderId
    });

  } catch (err) {
    const pub = toPublicError(err, "Gagal melakukan pembayaran");
    return sendResponse(res, pub.status, pub.message, []);
  }

};

