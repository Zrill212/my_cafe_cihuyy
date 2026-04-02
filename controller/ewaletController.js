const db = require("../config/db");
const { toPublicError } = require("../utils/publicError");

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

exports.getEwalets = (req, res) => {
  const cafeId = req.user?.cafe_id;
  db.query("SELECT * FROM ewalet WHERE cafe_id = ? ORDER BY id DESC", [cafeId], (err, results) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil data ewallet");
      return sendResponse(res, pub.status, pub.message, []);
    }
    return sendResponse(res, 200, "Berhasil mengambil data ewallet", results || []);
  });
};

exports.getEwaletById = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  db.query("SELECT * FROM ewalet WHERE id = ? AND cafe_id = ?", [id, cafeId], (err, results) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil detail ewallet");
      return sendResponse(res, pub.status, pub.message, []);
    }
    if (!results || results.length === 0) {
      return sendResponse(res, 404, "Ewallet tidak ditemukan", []);
    }
    return sendResponse(res, 200, "Berhasil mengambil detail ewallet", results[0]);
  });
};

exports.createEwalet = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const { nama_wallet, nomor_wallet, nama_pemilik } = req.body;

  if (!nama_wallet) return sendResponse(res, 400, "nama_wallet wajib diisi", []);
  if (!nomor_wallet) return sendResponse(res, 400, "nomor_wallet wajib diisi", []);

  db.query(
    "INSERT INTO ewalet (cafe_id, nama_wallet, nomor_wallet, nama_pemilik) VALUES (?, ?, ?, ?)",
    [cafeId, nama_wallet, nomor_wallet, nama_pemilik ?? null],
    (err, result) => {
      if (err) {
        const pub = toPublicError(err, "Gagal menambahkan ewallet");
        return sendResponse(res, pub.status, pub.message, []);
      }
      return sendResponse(res, 201, "Ewallet berhasil ditambahkan", { id: result.insertId });
    },
  );
};

exports.updateEwalet = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  const { nama_wallet, nomor_wallet, nama_pemilik } = req.body;

  db.query(
    "UPDATE ewalet SET nama_wallet = COALESCE(?, nama_wallet), nomor_wallet = COALESCE(?, nomor_wallet), nama_pemilik = COALESCE(?, nama_pemilik) WHERE id = ? AND cafe_id = ?",
    [nama_wallet ?? null, nomor_wallet ?? null, nama_pemilik ?? null, id, cafeId],
    (err, result) => {
      if (err) {
        const pub = toPublicError(err, "Gagal update ewallet");
        return sendResponse(res, pub.status, pub.message, []);
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Ewallet tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Ewallet berhasil diupdate", {});
    },
  );
};

exports.deleteEwalet = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  db.query("DELETE FROM ewalet WHERE id = ? AND cafe_id = ?", [id, cafeId], (err, result) => {
    if (err) {
      const pub = toPublicError(err, "Gagal hapus ewallet");
      return sendResponse(res, pub.status, pub.message, []);
    }
    if (!result || result.affectedRows === 0) {
      return sendResponse(res, 404, "Ewallet tidak ditemukan", []);
    }
    return sendResponse(res, 200, "Ewallet berhasil dihapus", []);
  });
};
