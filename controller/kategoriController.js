const db = require("../config/db");
const fs = require("fs");
const path = require("path");

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ensureAssetDir = () => {
  const assetDir = path.join(__dirname, "..", "asset");
  fs.mkdirSync(assetDir, { recursive: true });
  return assetDir;
};

const extFromMime = (mime) => {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return ".jpg";
};

const buildPublicUrl = (filename) => {
  const baseUrl = (process.env.BASE_URL || "").replace(/\/$/, "");
  return `${baseUrl}/asset/${filename}`;
};

/**
 * Simpan logo dari:
 * - req.file (multipart/form-data via multer), ATAU
 * - req.body.logo / req.body.image_base64 (application/json dengan base64)
 * Return public URL-nya, atau null kalau tidak ada.
 */
const saveLogoIfAny = (req) => {
  // Case 1: multipart/form-data via multer memory storage
  if (req.file && req.file.buffer && req.file.buffer.length > 0) {
    const assetDir = ensureAssetDir();
    const ext = extFromMime(req.file.mimetype);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    fs.writeFileSync(path.join(assetDir, filename), req.file.buffer);
    return buildPublicUrl(filename);
  }

  // Case 2: application/json dengan base64 di field logo atau image_base64
  const base64 = req.body?.logo || req.body?.image_base64;
  if (base64 && typeof base64 === "string" && base64.startsWith("data:")) {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      const assetDir = ensureAssetDir();
      const ext = extFromMime(match[1]);
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      fs.writeFileSync(path.join(assetDir, filename), Buffer.from(match[2], "base64"));
      return buildPublicUrl(filename);
    }
  }

  return null;
};

/**
 * Hapus file lokal dari public URL jika ada.
 * Misal: "http://domain.com/asset/123.jpg" -> hapus file ./asset/123.jpg
 */
const deleteLogoFile = (logoUrl) => {
  if (!logoUrl || typeof logoUrl !== "string") return;
  try {
    const match = logoUrl.match(/\/asset\/([^/]+)$/);
    if (!match) return;
    const filepath = path.join(__dirname, "..", "asset", match[1]);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (err) {
    console.error("[deleteLogoFile] Gagal hapus file:", err.message);
  }
};

// ─── Controllers ─────────────────────────────────────────────────────────────

exports.getKategoris = (req, res) => {
  const cafeId = req.user?.cafe_id;

  db.query(
    "SELECT * FROM kategoris WHERE cafe_id = ?",
    [cafeId],
    (err, results) => {
      if (err) {
        return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal mengambil data kategori", []);
      }
      return sendResponse(res, 200, "Berhasil mengambil data kategori", results || []);
    }
  );
};

exports.getKategoriById = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  db.query(
    "SELECT * FROM kategoris WHERE id = ? AND cafe_id = ?",
    [id, cafeId],
    (err, results) => {
      if (err) {
        return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal mengambil detail kategori", []);
      }
      if (!results || results.length === 0) {
        return sendResponse(res, 404, "Kategori tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Berhasil mengambil detail kategori", results[0]);
    }
  );
};

exports.createKategori = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const { nama_kategori } = req.body;

  if (!nama_kategori) {
    return sendResponse(res, 400, "nama_kategori wajib diisi", []);
  }

  // Support multipart/form-data (req.file) DAN application/json (base64 di body)
  const logoUrl = saveLogoIfAny(req);

  db.query(
    "INSERT INTO kategoris (cafe_id, nama_kategori, logo) VALUES (?, ?, ?)",
    [cafeId, nama_kategori, logoUrl],
    (err, result) => {
      if (err) {
        return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal menambahkan kategori", []);
      }
      return sendResponse(res, 201, "Kategori berhasil ditambahkan", {
        id: result.insertId,
        ...(logoUrl && { logo: logoUrl }),
      });
    }
  );
};

exports.updateKategori = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  const { nama_kategori } = req.body;

  // Support multipart/form-data (req.file) DAN application/json (base64 di body)
  const newLogoUrl = saveLogoIfAny(req);

  // Ambil logo lama dulu untuk dihapus setelah update berhasil
  db.query(
    "SELECT logo FROM kategoris WHERE id = ? AND cafe_id = ?",
    [id, cafeId],
    (err, results) => {
      if (err) {
        return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal mengambil data kategori", []);
      }
      if (!results || results.length === 0) {
        return sendResponse(res, 404, "Kategori tidak ditemukan", []);
      }

      const oldLogoUrl = results[0].logo;

      let query = "UPDATE kategoris SET nama_kategori = ?";
      let values = [nama_kategori];

      if (newLogoUrl) {
        query += ", logo = ?";
        values.push(newLogoUrl);
      }

      query += " WHERE id = ? AND cafe_id = ?";
      values.push(id, cafeId);

      db.query(query, values, (err2, result) => {
        if (err2) {
          return sendResponse(res, 500, err2?.sqlMessage || err2?.message || "Gagal update kategori", []);
        }
        if (!result || result.affectedRows === 0) {
          return sendResponse(res, 404, "Kategori tidak ditemukan", []);
        }

        // Hapus file logo lama setelah update berhasil
        if (newLogoUrl && oldLogoUrl) {
          deleteLogoFile(oldLogoUrl);
        }

        return sendResponse(res, 200, "Kategori berhasil diupdate", {
          id: parseInt(id),
          ...(newLogoUrl && { logo: newLogoUrl }),
        });
      });
    }
  );
};

exports.deleteKategori = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  // Ambil logo dulu sebelum dihapus dari DB
  db.query(
    "SELECT logo FROM kategoris WHERE id = ? AND cafe_id = ?",
    [id, cafeId],
    (err, results) => {
      if (err) {
        return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal mengambil data kategori", []);
      }
      if (!results || results.length === 0) {
        return sendResponse(res, 404, "Kategori tidak ditemukan", []);
      }

      const logoUrl = results[0].logo;

      db.query(
        "DELETE FROM kategoris WHERE id = ? AND cafe_id = ?",
        [id, cafeId],
        (err2, result) => {
          if (err2) {
            return sendResponse(res, 500, err2?.sqlMessage || err2?.message || "Gagal hapus kategori", []);
          }
          if (!result || result.affectedRows === 0) {
            return sendResponse(res, 404, "Kategori tidak ditemukan", []);
          }

          // Hapus file logo setelah record berhasil dihapus
          deleteLogoFile(logoUrl);

          return sendResponse(res, 200, "Kategori berhasil dihapus", {});
        }
      );
    }
  );
};

exports.getKategorisPublic = (req, res) => {
  const cafeId = req.params.cafe_id;

  db.query(
    "SELECT * FROM kategoris WHERE cafe_id = ?",
    [cafeId],
    (err, results) => {
      if (err) {
        return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal mengambil kategori", []);
      }
      return sendResponse(res, 200, "Berhasil mengambil kategori", results || []);
    }
  );
};