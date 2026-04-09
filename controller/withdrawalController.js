const db = require("../config/db");
const util = require("util");
const { toPublicError } = require("../utils/publicError");

const query = util.promisify(db.query).bind(db);

const ensureWithdrawalTable = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS cafe_withdrawal_requests (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      client_ref VARCHAR(80) NULL,
      cafe_id INT NOT NULL,
      admin_id INT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      method VARCHAR(40) NOT NULL DEFAULT 'transfer_bank',
      bank_name VARCHAR(100) NULL,
      account_number VARCHAR(64) NULL,
      account_holder VARCHAR(100) NULL,
      status ENUM('pending','processing','completed','rejected') NOT NULL DEFAULT 'processing',
      fingerprint VARCHAR(255) NULL,
      note TEXT NULL,
      superadmin_note TEXT NULL,
      processed_by_superadmin_id INT NULL,
      processed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cafe_withdrawal_client_ref (cafe_id, client_ref),
      INDEX idx_cafe_withdrawal_cafe (cafe_id),
      INDEX idx_cafe_withdrawal_status (status),
      INDEX idx_cafe_withdrawal_created (created_at)
    )`,
  );
};

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
    success: httpStatus >= 200 && httpStatus < 300,
  });
};

const normalizeClientRef = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s.slice(0, 80) : null;
};

const mapRow = (row) => {
  if (!row) return row;
  return {
    id: Number(row.id),
    client_ref: row.client_ref,
    cafe_id: row.cafe_id != null ? Number(row.cafe_id) : null,
    admin_id: row.admin_id != null ? Number(row.admin_id) : null,
    amount: Number(row.amount ?? 0),
    method: row.method,
    bank_name: row.bank_name,
    account_number: row.account_number,
    account_holder: row.account_holder,
    status: row.status,
    fingerprint: row.fingerprint,
    note: row.note,
    superadmin_note: row.superadmin_note,
    processed_by_superadmin_id:
      row.processed_by_superadmin_id != null ? Number(row.processed_by_superadmin_id) : null,
    processed_at: row.processed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    nama_cafe: row.nama_cafe ?? undefined,
  };
};

/** Admin cafe: kirim pengajuan pencairan ke superadmin */
exports.create = async (req, res) => {
  if (req.user?.role !== "admin") {
    return sendResponse(res, 403, "Hanya admin cafe yang dapat mengajukan pencairan", null);
  }

  const cafeId = req.user.cafe_id;
  const adminId = req.user.id;

  const {
    client_ref: rawRef,
    amount,
    method = "transfer_bank",
    bank_name,
    account_number,
    account_holder,
    fingerprint,
    note,
  } = req.body || {};

  const client_ref = normalizeClientRef(rawRef);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return sendResponse(res, 400, "amount harus lebih dari 0", null);
  }

  if (client_ref) {
    try {
      const dup = await query(
        "SELECT * FROM cafe_withdrawal_requests WHERE cafe_id = ? AND client_ref = ? LIMIT 1",
        [cafeId, client_ref],
      );
      if (dup && dup.length) {
        return sendResponse(res, 409, "Pengajuan dengan client_ref ini sudah ada", mapRow(dup[0]));
      }
    } catch (_) {
      /* lanjut insert */
    }
  }

  try {
    await ensureWithdrawalTable();
    const result = await query(
      `INSERT INTO cafe_withdrawal_requests
       (client_ref, cafe_id, admin_id, amount, method, bank_name, account_number, account_holder, status, fingerprint, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?)`,
      [
        client_ref,
        cafeId,
        adminId,
        amt,
        String(method || "transfer_bank").slice(0, 40),
        bank_name || null,
        account_number || null,
        account_holder || null,
        fingerprint || null,
        note || null,
      ],
    );

    const insertId = result?.insertId;
    const rows = await query(
      "SELECT * FROM cafe_withdrawal_requests WHERE id = ? LIMIT 1",
      [insertId],
    );
    return sendResponse(res, 201, "Pengajuan pencairan dikirim", mapRow(rows[0]));
  } catch (err) {
    console.error("[WITHDRAWAL][CREATE] error:", err);
    if (String(err?.code) === "ER_DUP_ENTRY") {
      return sendResponse(res, 409, "client_ref sudah digunakan untuk cafe ini", null);
    }
    const pub = toPublicError(err, "Gagal menyimpan pengajuan pencairan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

/** Admin cafe: daftar pengajuan cafe sendiri */
exports.listMine = async (req, res) => {
  if (req.user?.role !== "admin") {
    return sendResponse(res, 403, "Hanya admin cafe", null);
  }

  const cafeId = req.user.cafe_id;
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const status = req.query.status ? String(req.query.status) : null;

  try {
    await ensureWithdrawalTable();
    let sql = `SELECT * FROM cafe_withdrawal_requests WHERE cafe_id = ?`;
    const vals = [cafeId];
    if (status) {
      sql += ` AND status = ?`;
      vals.push(status);
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    vals.push(limit);

    const rows = await query(sql, vals);
    return sendResponse(
      res,
      200,
      "Berhasil mengambil riwayat pencairan",
      (rows || []).map(mapRow),
    );
  } catch (err) {
    console.error("[WITHDRAWAL][LIST_MINE] error:", err);
    const pub = toPublicError(err, "Gagal mengambil riwayat pencairan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

/** Superadmin: semua pengajuan (filter status) */
exports.superAdminList = async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const status = req.query.status ? String(req.query.status) : null;
  const cafeId = req.query.cafe_id ? Number(req.query.cafe_id) : null;

  try {
    await ensureWithdrawalTable();
    let sql = `
      SELECT w.*, c.nama_cafe
      FROM cafe_withdrawal_requests w
      LEFT JOIN cafe c ON c.id = w.cafe_id
      WHERE 1=1`;
    const vals = [];

    if (status) {
      sql += ` AND w.status = ?`;
      vals.push(status);
    }
    if (cafeId && Number.isFinite(cafeId)) {
      sql += ` AND w.cafe_id = ?`;
      vals.push(cafeId);
    }
    sql += ` ORDER BY w.created_at DESC LIMIT ?`;
    vals.push(limit);

    const rows = await query(sql, vals);
    return sendResponse(
      res,
      200,
      "Berhasil mengambil daftar pengajuan pencairan",
      (rows || []).map(mapRow),
    );
  } catch (err) {
    console.error("[WITHDRAWAL][SUPERADMIN_LIST] error:", err);
    const pub = toPublicError(err, "Gagal mengambil pengajuan pencairan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

/** Superadmin: tandai transfer selesai */
exports.superAdminComplete = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return sendResponse(res, 400, "id tidak valid", null);
  }

  const { superadmin_note } = req.body || {};
  const superAdminId = req.superAdmin?.id;

  try {
    await ensureWithdrawalTable();
    const rows = await query(
      "SELECT * FROM cafe_withdrawal_requests WHERE id = ? LIMIT 1",
      [id],
    );
    if (!rows || rows.length === 0) {
      return sendResponse(res, 404, "Pengajuan tidak ditemukan", null);
    }
    const row = rows[0];
    if (row.status === "completed") {
      return sendResponse(res, 200, "Sudah selesai sebelumnya", mapRow(row));
    }
    if (row.status === "rejected") {
      return sendResponse(res, 400, "Pengajuan sudah ditolak", mapRow(row));
    }

    await query(
      `UPDATE cafe_withdrawal_requests
       SET status = 'completed',
           processed_by_superadmin_id = ?,
           processed_at = NOW(),
           superadmin_note = COALESCE(?, superadmin_note),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [superAdminId || null, superadmin_note || null, id],
    );

    const updated = await query(
      "SELECT w.*, c.nama_cafe FROM cafe_withdrawal_requests w LEFT JOIN cafe c ON c.id = w.cafe_id WHERE w.id = ? LIMIT 1",
      [id],
    );
    return sendResponse(res, 200, "Berhasil ditandai selesai", mapRow(updated[0]));
  } catch (err) {
    console.error("[WITHDRAWAL][SUPERADMIN_COMPLETE] error:", err);
    const pub = toPublicError(err, "Gagal memperbarui status");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

/** Superadmin: tolak pengajuan */
exports.superAdminReject = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return sendResponse(res, 400, "id tidak valid", null);
  }

  const { superadmin_note } = req.body || {};
  const superAdminId = req.superAdmin?.id;

  try {
    await ensureWithdrawalTable();
    const rows = await query(
      "SELECT * FROM cafe_withdrawal_requests WHERE id = ? LIMIT 1",
      [id],
    );
    if (!rows || rows.length === 0) {
      return sendResponse(res, 404, "Pengajuan tidak ditemukan", null);
    }
    const row = rows[0];
    if (row.status === "completed" || row.status === "rejected") {
      return sendResponse(res, 400, "Status tidak dapat diubah", mapRow(row));
    }

    await query(
      `UPDATE cafe_withdrawal_requests
       SET status = 'rejected',
           processed_by_superadmin_id = ?,
           processed_at = NOW(),
           superadmin_note = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [superAdminId || null, superadmin_note || null, id],
    );

    const updated = await query(
      "SELECT w.*, c.nama_cafe FROM cafe_withdrawal_requests w LEFT JOIN cafe c ON c.id = w.cafe_id WHERE w.id = ? LIMIT 1",
      [id],
    );
    return sendResponse(res, 200, "Pengajuan ditolak", mapRow(updated[0]));
  } catch (err) {
    console.error("[WITHDRAWAL][SUPERADMIN_REJECT] error:", err);
    const pub = toPublicError(err, "Gagal menolak pengajuan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};
