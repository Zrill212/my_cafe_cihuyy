const db = require("../config/db");
const bcrypt = require("bcryptjs");
const util = require("util");
const fs = require("fs");
const path = require("path");
const query = util.promisify(db.query).bind(db);
const { toPublicError } = require("../utils/publicError");
const cache = require("../utils/cache");

const sendResponse = (res, httpStatus, message, data = {}) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
    success: httpStatus >= 200 && httpStatus < 300,
  });
};

exports.getPengaturan = async (req, res) => {
  const adminId = req.user?.id;
  const cafeId  = req.user?.cafe_id;

  if (!adminId || !cafeId) {
    return sendResponse(res, 401, "Token tidak valid atau sesi habis");
  }

  try {
    const adminRows = await query(
      "SELECT id, username, email FROM admins WHERE id = ?",
      [adminId]
    );
    if (!adminRows || adminRows.length === 0) {
      return sendResponse(res, 404, "Admin tidak ditemukan");
    }

    const cafeRows = await query(
      "SELECT nama_cafe, alamat, logo_cafe, tema_colors FROM cafe WHERE id = ?",
      [cafeId]
    );
    if (!cafeRows || cafeRows.length === 0) {
      return sendResponse(res, 404, "Kafe tidak ditemukan");
    }

    const admin = adminRows[0];
    const cafe  = cafeRows[0];

    return sendResponse(res, 200, "Berhasil mengambil pengaturan", {
      username:    admin.username,
      email:       admin.email,
      nama_cafe:   cafe.nama_cafe,
      alamat:      cafe.alamat    ?? "",
      logo_cafe:   cafe.logo_cafe ?? "",
      tema_colors: cafe.tema_colors ?? null,
    });

  } catch (err) {
    const pub = toPublicError(err, "Gagal mengambil pengaturan");
    return sendResponse(res, pub.status, pub.message);
  }
};

exports.savePengaturan = async (req, res) => {
  const adminId = req.user?.id;
  const cafeId  = req.user?.cafe_id;

  if (!adminId || !cafeId) {
    return sendResponse(res, 401, "Token tidak valid atau sesi habis");
  }

  const { nama_cafe, alamat, logo_cafe, tema_colors } = req.body;

  if (!nama_cafe?.trim()) {
    return sendResponse(res, 400, "Nama kafe wajib diisi");
  }

  try {
    let logoFile = null;

    // kalau ada base64 logo
    if (logo_cafe && logo_cafe.startsWith("data:image")) {

      const matches = logo_cafe.match(/^data:image\/(\w+);base64,(.+)$/);

      if (matches) {
        const ext = matches[1];
        const data = matches[2];

        const filename = "logo_" + Date.now() + "." + ext;
        const filepath = path.join(__dirname, "../asset", filename);

        fs.writeFileSync(filepath, Buffer.from(data, "base64"));

        logoFile = filename;
      }

    } else {

      const rows = await query(
        "SELECT logo_cafe FROM cafe WHERE id = ?",
        [cafeId]
      );

      logoFile = rows[0]?.logo_cafe ?? null;
    }

    await query(
      `UPDATE cafe 
       SET nama_cafe = ?, alamat = ?, logo_cafe = ?, tema_colors = ?
       WHERE id = ?`,
      [
        nama_cafe.trim(),
        alamat ?? "",
        logoFile,
        tema_colors
          ? (typeof tema_colors === "string"
              ? tema_colors
              : JSON.stringify(tema_colors))
          : null,
        cafeId,
      ]
    );

    cache.del(cache.buildKey("pengaturan", "public", cafeId));
    return sendResponse(res, 200, "Pengaturan berhasil disimpan", {
      nama_cafe,
      alamat,
      logo_cafe: logoFile
        ? `http://${req.headers.host}/asset/${logoFile}`
        : null
    });

  } catch (err) {
    const pub = toPublicError(err, "Gagal menyimpan pengaturan");
    return sendResponse(res, pub.status, pub.message);
  }
};

exports.gantiPassword = async (req, res) => {
  const adminId = req.user?.id;

  if (!adminId) {
    return sendResponse(res, 401, "Token tidak valid atau sesi habis");
  }

  const { password_lama, password_baru, konfirmasi } = req.body;

  if (!password_lama || !password_baru || !konfirmasi) {
    return sendResponse(res, 400, "Semua field password wajib diisi");
  }
  if (password_baru.length < 6) {
    return sendResponse(res, 400, "Password baru minimal 6 karakter");
  }
  if (password_baru !== konfirmasi) {
    return sendResponse(res, 400, "Konfirmasi password tidak cocok");
  }

  try {
    const rows = await query("SELECT password FROM admins WHERE id = ?", [adminId]);
    if (!rows || rows.length === 0) {
      return sendResponse(res, 404, "Admin tidak ditemukan");
    }

    const passwordOk = bcrypt.compareSync(password_lama, rows[0].password);
    if (!passwordOk) {
      return sendResponse(res, 401, "Password lama salah");
    }

    const newHash = bcrypt.hashSync(password_baru, 10);
    await query("UPDATE admins SET password = ? WHERE id = ?", [newHash, adminId]);

    return sendResponse(res, 200, "Password berhasil diganti");

  } catch (err) {
    const pub = toPublicError(err, "Gagal mengganti password");
    return sendResponse(res, pub.status, pub.message);
  }
};

exports.getPengaturanPublic = async (req, res) => {
  const cafeId = req.params.cafe_id;

  if (!cafeId) {
    return sendResponse(res, 400, "Cafe ID tidak ditemukan");
  }

  const key = cache.buildKey("pengaturan", "public", cafeId);
  const ttl = Number(process.env.CACHE_TTL_PENGATURAN_PUBLIC || 120);

  try {
    const hit = await cache.getJSON(key);
    if (hit) {
      return sendResponse(res, 200, "Berhasil mengambil pengaturan cafe", hit);
    }

    const cafeRows = await query(
      "SELECT nama_cafe, alamat, logo_cafe, tema_colors FROM cafe WHERE id = ?",
      [cafeId]
    );

    if (!cafeRows || cafeRows.length === 0) {
      return sendResponse(res, 404, "Cafe tidak ditemukan");
    }

    const cafe = cafeRows[0];

    const payload = {
      nama_cafe: cafe.nama_cafe,
      alamat: cafe.alamat ?? "",
      logo_cafe: cafe.logo_cafe
        ? `http://${req.headers.host}/${cafe.logo_cafe}`
        : null,
      tema_colors: cafe.tema_colors ?? null,
    };

    cache.setJSON(key, payload, ttl);
    return sendResponse(res, 200, "Berhasil mengambil pengaturan cafe", payload);

  } catch (err) {
    const pub = toPublicError(err, "Gagal mengambil pengaturan cafe");
    return sendResponse(res, pub.status, pub.message);
  }
};