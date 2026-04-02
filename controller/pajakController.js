const db = require("../config/db");
const util = require("util");
const { toPublicError } = require("../utils/publicError");
const cache = require("../utils/cache");

const query = util.promisify(db.query).bind(db);

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
    success: httpStatus >= 200 && httpStatus < 300,
  });
};

const formatRow = (row) => {
  if (!row) return row;
  const pajakNum = Number(row.pajak ?? 0);
  return {
    id: row.id,
    cafe_id: row.cafe_id,
    pajak: pajakNum,
    pajak_persen: `${pajakNum}%`,
  };
};

const normalizePajak = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const int = Math.trunc(num);
  if (int < 1 || int > 100) return null;
  return int;
};

const ensureAdmin = (req, res) => {
  if (req.user?.role !== "admin") {
    sendResponse(res, 403, "Hanya admin yang boleh mengakses fitur ini", []);
    return false;
  }
  return true;
};

const ensureKasirOrAdmin = (req, res) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "kasir") {
    sendResponse(res, 403, "Akses ditolak", []);
    return false;
  }
  return true;
};

// GET /api/pajak/public/:cafe_id (tanpa token)
exports.getPajakPublic = async (req, res) => {
  const cafeId = req.params.cafe_id;
  if (!cafeId) return sendResponse(res, 400, "cafe_id wajib diisi", null);

  const key = cache.buildKey("pajaks", "public", cafeId);
  const ttl = Number(process.env.CACHE_TTL_PAJAK_PUBLIC || 120);

  try {
    const hit = await cache.getJSON(key);
    if (hit) return sendResponse(res, 200, "Berhasil mengambil pajak", hit);

    const rows = await query(
      "SELECT id, cafe_id, pajak FROM pajaks WHERE cafe_id = ? ORDER BY id DESC LIMIT 1",
      [cafeId],
    );

    if (!rows || rows.length === 0) {
      const payload = {
        id: null,
        cafe_id: Number(cafeId),
        pajak: 0,
        pajak_persen: "0%",
      };
      cache.setJSON(key, payload, ttl);
      return sendResponse(res, 200, "Berhasil mengambil pajak", payload);
    }

    const payload = formatRow(rows[0]);
    cache.setJSON(key, payload, ttl);
    return sendResponse(res, 200, "Berhasil mengambil pajak", payload);
  } catch (err) {
    const pub = toPublicError(err, "Gagal mengambil pajak");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

// GET /api/pajak (token kasir/admin)
exports.getPajak = async (req, res) => {
  if (!ensureKasirOrAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;

  const key = cache.buildKey("pajaks", "auth", cafeId);
  const ttl = Number(process.env.CACHE_TTL_PAJAK_AUTH || 60);

  try {
    const hit = await cache.getJSON(key);
    if (hit) return sendResponse(res, 200, "Berhasil mengambil pajak", hit);

    const rows = await query(
      "SELECT id, cafe_id, pajak FROM pajaks WHERE cafe_id = ? ORDER BY id DESC LIMIT 1",
      [cafeId],
    );

    if (!rows || rows.length === 0) {
      const payload = {
        id: null,
        cafe_id: Number(cafeId),
        pajak: 0,
        pajak_persen: "0%",
      };
      cache.setJSON(key, payload, ttl);
      return sendResponse(res, 200, "Berhasil mengambil pajak", payload);
    }

    const payload = formatRow(rows[0]);
    cache.setJSON(key, payload, ttl);
    return sendResponse(res, 200, "Berhasil mengambil pajak", payload);
  } catch (err) {
    const pub = toPublicError(err, "Gagal mengambil pajak");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

// GET /api/pajak/admin (token admin)
exports.adminGetAll = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;
  try {
    const rows = await query(
      "SELECT id, cafe_id, pajak FROM pajaks WHERE cafe_id = ? ORDER BY id DESC",
      [cafeId],
    );

    return sendResponse(res, 200, "Berhasil mengambil data pajak", (rows || []).map(formatRow));
  } catch (err) {
    const pub = toPublicError(err, "Gagal mengambil data pajak");
    return sendResponse(res, pub.status, pub.message, []);
  }
};

// PUT /api/pajak/admin (token admin) — 1 pajak per cafe (UPSERT)
exports.upsertPajak = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const cafeId = req.user?.cafe_id;
  const pajak = normalizePajak(req.body?.pajak);

  if (pajak === null) {
    return sendResponse(res, 400, "pajak wajib 1-100", []);
  }

  try {
    const existing = await query(
      "SELECT id FROM pajaks WHERE cafe_id = ? LIMIT 1",
      [cafeId],
    );

    if (existing && existing.length > 0) {
      const id = existing[0].id;
      const result = await query(
        "UPDATE pajaks SET pajak = ? WHERE id = ? AND cafe_id = ?",
        [pajak, id, cafeId],
      );

      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Data pajak tidak ditemukan", []);
      }

      cache.del(cache.buildKey("pajaks", "public", cafeId));
      cache.del(cache.buildKey("pajaks", "auth", cafeId));

      return sendResponse(res, 200, "Pajak berhasil diupdate", {
        id: Number(id),
        cafe_id: Number(cafeId),
        pajak,
        pajak_persen: `${pajak}%`,
      });
    }

    const result = await query(
      "INSERT INTO pajaks (cafe_id, pajak) VALUES (?, ?)",
      [cafeId, pajak],
    );

    cache.del(cache.buildKey("pajaks", "public", cafeId));
    cache.del(cache.buildKey("pajaks", "auth", cafeId));

    return sendResponse(res, 201, "Pajak berhasil ditambahkan", {
      id: result.insertId,
      cafe_id: Number(cafeId),
      pajak,
      pajak_persen: `${pajak}%`,
    });
  } catch (err) {
    console.error("[PAJAK][UPSERT] Error:", {
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
      sqlMessage: err?.sqlMessage,
      message: err?.message,
      sql: err?.sql,
      stack: err?.stack,
      cafe_id: cafeId,
      role: req.user?.role,
      user_id: req.user?.id,
    });
    const pub = toPublicError(err, "Gagal menyimpan pajak");
    return sendResponse(res, pub.status, pub.message, []);
  }
};
