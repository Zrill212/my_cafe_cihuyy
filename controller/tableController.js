const db = require("../config/db");
const QRCode = require("qrcode");
const { toPublicError } = require("../utils/publicError");
const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

// Get all tables for this cafe
exports.getTables = (req, res) => {
  const cafeId = req.user?.cafe_id;
  db.query("SELECT * FROM table_cafe WHERE cafe_id = ? ORDER BY nomor_meja ASC", [cafeId], (err, results) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil data meja");
      return sendResponse(res, pub.status, pub.message, []);
    }
    return sendResponse(res, 200, "Berhasil mengambil data meja", results || []);
  });
};

// Get QR code only (data URL) for a table
exports.getTableQR = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  db.query("SELECT qr_code, nomor_meja FROM table_cafe WHERE id = ? AND cafe_id = ?", [id, cafeId], (err, results) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil QR meja");
      return sendResponse(res, pub.status, pub.message, []);
    }
    if (!results || results.length === 0) {
      return sendResponse(res, 404, "Meja tidak ditemukan", []);
    }
    const { qr_code, nomor_meja } = results[0];
    return sendResponse(res, 200, "Berhasil mengambil QR meja", { id: parseInt(id), nomor_meja, qr_code });
  });
};

// Get table by id
exports.getTableById = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  db.query("SELECT * FROM table_cafe WHERE id = ? AND cafe_id = ?", [id, cafeId], (err, results) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil detail meja");
      return sendResponse(res, pub.status, pub.message, []);
    }
    if (!results || results.length === 0) {
      return sendResponse(res, 404, "Meja tidak ditemukan", []);
    }
    return sendResponse(res, 200, "Berhasil mengambil detail meja", results[0]);
  });
};

// Create new table: auto-increment nomor_meja, generate QR code
exports.createTable = async (req, res) => {
  const cafeId = req.user?.cafe_id;
  // Get last nomor_meja for this cafe
  db.query("SELECT MAX(nomor_meja) AS lastNomor FROM table_cafe WHERE cafe_id = ?", [cafeId], async (err, rows) => {
    if (err) {
      const pub = toPublicError(err, "Gagal menentukan nomor meja");
      return sendResponse(res, pub.status, pub.message, []);
    }
    const nextNomor = (rows && rows[0] && rows[0].lastNomor ? rows[0].lastNomor + 1 : 1);
    const status = true; // default aktif

    // Generate QR content: e.g. baseUrl/tables/{nextNomor} or custom
    const clientIp = (process.env.CLIENT_IP || process.env.BASE_URL || "").replace(/\/$/, "");
    const qrContent = `${clientIp}/user?cafe_id=${cafeId}&table=${nextNomor}`;
    let qrCodeDataUrl = null;
    try {
      qrCodeDataUrl = await QRCode.toDataURL(qrContent);
    } catch (qrErr) {
      return sendResponse(res, 500, "Gagal generate QR code", []);
    }

    db.query(
      "INSERT INTO table_cafe (cafe_id, nomor_meja, status, qr_code) VALUES (?, ?, ?, ?)",
      [cafeId, nextNomor, status, qrCodeDataUrl],
      (err2, result) => {
        if (err2) {
          const pub = toPublicError(err2, "Gagal menambahkan meja");
          return sendResponse(res, pub.status, pub.message, []);
        }
        return sendResponse(res, 201, "Meja berhasil ditambahkan", {
          id: result.insertId,
          nomor_meja: nextNomor,
          status,
          qr_code: qrCodeDataUrl,
        });
      }
    );
  });
};

// Update table (status only, nomor_meja and qr_code usually unchanged)
exports.updateTable = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  const { status } = req.body;
  db.query(
    "UPDATE table_cafe SET status = ? WHERE id = ? AND cafe_id = ?",
    [status, id, cafeId],
    (err, result) => {
      if (err) {
        const pub = toPublicError(err, "Gagal update meja");
        return sendResponse(res, pub.status, pub.message, []);
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Meja tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Meja berhasil diupdate", { id: parseInt(id), status });
    }
  );
};

// Delete table
exports.deleteTable = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  db.query("DELETE FROM table_cafe WHERE id = ? AND cafe_id = ?", [id, cafeId], (err, result) => {
    if (err) {
      const pub = toPublicError(err, "Gagal menghapus meja");
      return sendResponse(res, pub.status, pub.message, []);
    }
    if (!result || result.affectedRows === 0) {
      return sendResponse(res, 404, "Meja tidak ditemukan", []);
    }
    return sendResponse(res, 200, "Meja berhasil dihapus", []);
  });
};
