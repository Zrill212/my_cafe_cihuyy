const db = require("../config/db");
const { toPublicError } = require("../utils/publicError");

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

exports.getBankTransfers = (req, res) => {
  const cafeId = req.user?.cafe_id;
  db.query("SELECT * FROM bank_transfer WHERE cafe_id = ? ORDER BY id DESC", [cafeId], (err, results) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil data bank transfer");
      return sendResponse(res, pub.status, pub.message, []);
    }
    return sendResponse(res, 200, "Berhasil mengambil data bank transfer", results || []);
  });
};

exports.getBankTransferById = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  db.query("SELECT * FROM bank_transfer WHERE id = ? AND cafe_id = ?", [id, cafeId], (err, results) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil detail bank transfer");
      return sendResponse(res, pub.status, pub.message, []);
    }
    if (!results || results.length === 0) {
      return sendResponse(res, 404, "Bank transfer tidak ditemukan", []);
    }
    return sendResponse(res, 200, "Berhasil mengambil detail bank transfer", results[0]);
  });
};

exports.createBankTransfer = (req, res) => {
  const cafeId = req.user?.cafe_id;

  const accounts = Array.isArray(req.body?.accounts) ? req.body.accounts : null;
  if (accounts && accounts.length > 0) {
    const values = [];
    for (const acc of accounts) {
      const nama_bank = acc?.nama_bank;
      const nomor_bank = acc?.nomor_bank ?? acc?.no_rekening;
      const nama_pemilik = acc?.nama_pemilik ?? acc?.atas_nama;

      if (!nama_bank) return sendResponse(res, 400, "nama_bank wajib diisi", []);
      if (nomor_bank === undefined || nomor_bank === null || nomor_bank === "") {
        return sendResponse(res, 400, "nomor_bank wajib diisi", []);
      }
      if (!nama_pemilik) return sendResponse(res, 400, "nama_pemilik wajib diisi", []);

      values.push([cafeId, nama_bank, nomor_bank, nama_pemilik]);
    }

    db.query(
      "INSERT INTO bank_transfer (cafe_id, nama_bank, nomor_bank, nama_pemilik) VALUES ?",
      [values],
      (err) => {
        if (err) {
          const pub = toPublicError(err, "Gagal menambahkan bank transfer");
          return sendResponse(res, pub.status, pub.message, []);
        }
        return sendResponse(res, 201, "Bank transfer berhasil ditambahkan", []);
      },
    );

    return;
  }

  const nama_bank = req.body?.nama_bank;
  const nomor_bank = req.body?.nomor_bank ?? req.body?.no_rekening;
  const nama_pemilik = req.body?.nama_pemilik ?? req.body?.atas_nama;

  if (!nama_bank) return sendResponse(res, 400, "nama_bank wajib diisi", []);
  if (nomor_bank === undefined || nomor_bank === null || nomor_bank === "") {
    return sendResponse(res, 400, "nomor_bank wajib diisi", []);
  }
  if (!nama_pemilik) return sendResponse(res, 400, "nama_pemilik wajib diisi", []);

  db.query(
    "INSERT INTO bank_transfer (cafe_id, nama_bank, nomor_bank, nama_pemilik) VALUES (?, ?, ?, ?)",
    [cafeId, nama_bank, nomor_bank, nama_pemilik],
    (err, result) => {
      if (err) {
        const pub = toPublicError(err, "Gagal menambahkan bank transfer");
        return sendResponse(res, pub.status, pub.message, []);
      }
      return sendResponse(res, 201, "Bank transfer berhasil ditambahkan", { id: result.insertId });
    },
  );
};

exports.updateBankTransfer = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  const { nama_bank, nomor_bank, nama_pemilik } = req.body;

  db.query(
    "UPDATE bank_transfer SET nama_bank = COALESCE(?, nama_bank), nomor_bank = COALESCE(?, nomor_bank), nama_pemilik = COALESCE(?, nama_pemilik) WHERE id = ? AND cafe_id = ?",
    [nama_bank ?? null, nomor_bank ?? null, nama_pemilik ?? null, id, cafeId],
    (err, result) => {
      if (err) {
        const pub = toPublicError(err, "Gagal update bank transfer");
        return sendResponse(res, pub.status, pub.message, []);
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Bank transfer tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Bank transfer berhasil diupdate", {});
    },
  );
};

exports.deleteBankTransfer = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  db.query("DELETE FROM bank_transfer WHERE id = ? AND cafe_id = ?", [id, cafeId], (err, result) => {
    if (err) {
      const pub = toPublicError(err, "Gagal hapus bank transfer");
      return sendResponse(res, pub.status, pub.message, []);
    }
    if (!result || result.affectedRows === 0) {
      return sendResponse(res, 404, "Bank transfer tidak ditemukan", []);
    }
    return sendResponse(res, 200, "Bank transfer berhasil dihapus", []);
  });
};
