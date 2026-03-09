const db = require("../config/db");
const bcrypt = require("bcryptjs");
const util = require("util");

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

const ensureKasirOrAdmin = (req, res) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "kasir") {
    sendResponse(res, 403, "Akses ditolak", []);
    return false;
  }
  return true;
};

exports.createKasir = async (req, res) => {
  const requesterRole = req.user?.role;
  const cafeId = req.user?.cafe_id;

  if (requesterRole !== "admin") {
    return sendResponse(res, 403, "Hanya admin yang boleh menambahkan kasir", []);
  }

  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return sendResponse(res, 400, "username, email, dan password wajib diisi", []);
  }

  try {
    const existingAdmin = await query("SELECT id FROM admins WHERE email = ? LIMIT 1", [email]);
    if (existingAdmin && existingAdmin.length > 0) {
      return sendResponse(res, 409, "Email sudah terdaftar sebagai admin", []);
    }

    const existingKasir = await query("SELECT id FROM kasirs WHERE email = ? LIMIT 1", [email]);
    if (existingKasir && existingKasir.length > 0) {
      return sendResponse(res, 409, "Email sudah terdaftar sebagai kasir", []);
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const result = await query(
      "INSERT INTO kasirs (cafe_id, username, email, password) VALUES (?, ?, ?, ?)",
      [cafeId, username, email, passwordHash],
    );

    return sendResponse(res, 201, "Kasir berhasil ditambahkan", {
      id: result.insertId,
      cafe_id: cafeId,
    });
  } catch (err) {
    return sendResponse(
      res,
      500,
      err?.sqlMessage || err?.message || "Gagal menambahkan kasir",
      [],
    );
  }
};

exports.payOrder = async (req, res) => {
  if (!ensureKasirOrAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;
  const orderId = req.body?.order_id || req.params?.order_id;

  if (!orderId) {
    return sendResponse(res, 400, "order_id wajib diisi", []);
  }

  try {
    const orderRows = await query(
      "SELECT id, cafe_id, status, total, meja, nama, note, method, estimasi, created_at FROM orders WHERE id = ? AND cafe_id = ? LIMIT 1",
      [orderId, cafeId],
    );

    if (!orderRows || orderRows.length === 0) {
      return sendResponse(res, 404, "Order tidak ditemukan", []);
    }

    await query("UPDATE orders SET status = 'selesai' WHERE id = ? AND cafe_id = ?", [orderId, cafeId]);

    const items = await query(
      "SELECT nama_menu, qty, harga, catatan FROM order_items WHERE order_id = ?",
      [orderId],
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

    const items_total = normalizedItems.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
    const order_total = Number(orderRows[0]?.total ?? 0);
    const total_bayar = order_total > 0 ? order_total : items_total;

    return sendResponse(res, 200, "Pembayaran berhasil, status order selesai", {
      order: {
        ...orderRows[0],
        status: "selesai",
        total: order_total,
      },
      items: normalizedItems,
      items_total,
      total_bayar,
    });
  } catch (err) {
    return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal memproses pembayaran", []);
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
    const orderRows = await query("SELECT id, cafe_id, meja, nama, status, total, note, method, estimasi, created_at FROM orders WHERE id = ? AND cafe_id = ? LIMIT 1", [orderId, cafeId]);
    if (!orderRows || orderRows.length === 0) {
      return sendResponse(res, 404, "Order tidak ditemukan", []);
    }

    const items = await query(
      "SELECT nama_menu, qty, harga, catatan FROM order_items WHERE order_id = ?",
      [orderId],
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

    const items_total = normalizedItems.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
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
    return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal mengambil detail pembayaran", []);
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
    return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal mengambil data kasir", []);
  }
};

exports.getKasirById = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  try {
    const rows = await query("SELECT * FROM kasirs WHERE id = ? AND cafe_id = ? LIMIT 1", [id, cafeId]);
    if (!rows || rows.length === 0) {
      return sendResponse(res, 404, "Kasir tidak ditemukan", []);
    }
    return sendResponse(res, 200, "Berhasil mengambil detail kasir", omitPassword(rows[0]));
  } catch (err) {
    return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal mengambil detail kasir", []);
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
    const existing = await query("SELECT id FROM kasirs WHERE id = ? AND cafe_id = ? LIMIT 1", [id, cafeId]);
    if (!existing || existing.length === 0) {
      return sendResponse(res, 404, "Kasir tidak ditemukan", []);
    }

    if (email) {
      const existingAdmin = await query("SELECT id FROM admins WHERE email = ? LIMIT 1", [email]);
      if (existingAdmin && existingAdmin.length > 0) {
        return sendResponse(res, 409, "Email sudah terdaftar sebagai admin", []);
      }

      const existingKasir = await query("SELECT id FROM kasirs WHERE email = ? AND id <> ? LIMIT 1", [email, id]);
      if (existingKasir && existingKasir.length > 0) {
        return sendResponse(res, 409, "Email sudah terdaftar sebagai kasir", []);
      }
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
    await query(`UPDATE kasirs SET ${fields.join(", ")} WHERE id = ? AND cafe_id = ?`, values);

    return sendResponse(res, 200, "Kasir berhasil diupdate", { id: parseInt(id) });
  } catch (err) {
    return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal update kasir", []);
  }
};

exports.deleteKasir = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  try {
    const result = await query("DELETE FROM kasirs WHERE id = ? AND cafe_id = ?", [id, cafeId]);
    if (!result || result.affectedRows === 0) {
      return sendResponse(res, 404, "Kasir tidak ditemukan", []);
    }
    return sendResponse(res, 200, "Kasir berhasil dihapus", { id: parseInt(id) });
  } catch (err) {
    return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal hapus kasir", []);
  }
};
