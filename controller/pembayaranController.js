const db = require("../config/db");

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

const DEFAULT_METHODS = ["tunai", "qris", "transfer_bank", "ewalet_manual"];

const ensureDefaultMethods = (cafeId, cb) => {
  db.query(
    "SELECT * FROM pembayaran WHERE cafe_id = ? ORDER BY id ASC",
    [cafeId],
    (err, rows) => {
      if (err) return cb(err);

      if (rows && rows.length > 0) {
        return cb(null, rows);
      }

      const values = DEFAULT_METHODS.map((m) => [cafeId, m, 0]);
      db.query(
        "INSERT INTO pembayaran (cafe_id, nama_method, status_method) VALUES ?",
        [values],
        (err2) => {
          if (err2) return cb(err2);
          db.query(
            "SELECT * FROM pembayaran WHERE cafe_id = ? ORDER BY id ASC",
            [cafeId],
            (err3, rows2) => {
              if (err3) return cb(err3);
              return cb(null, rows2 || []);
            },
          );
        },
      );
    },
  );
};

exports.getPembayaran = (req, res) => {
  const cafeId = req.user?.cafe_id;

  ensureDefaultMethods(cafeId, (err, rows) => {
    if (err) {
      return sendResponse(
        res,
        500,
        err?.sqlMessage || err?.message || "Gagal mengambil data pembayaran",
        [],
      );
    }
    return sendResponse(res, 200, "Berhasil mengambil data pembayaran", rows || []);
  });
};

exports.getPembayaranById = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  db.query(
    "SELECT * FROM pembayaran WHERE id = ? AND cafe_id = ?",
    [id, cafeId],
    (err, results) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal mengambil detail pembayaran",
          [],
        );
      }
      if (!results || results.length === 0) {
        return sendResponse(res, 404, "Pembayaran tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Berhasil mengambil detail pembayaran", results[0]);
    },
  );
};

exports.createPembayaran = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const { nama_method, status_method } = req.body;

  if (!nama_method) {
    return sendResponse(res, 400, "nama_method wajib diisi", []);
  }

  const status = status_method === undefined ? 0 : status_method ? 1 : 0;

  db.query(
    "INSERT INTO pembayaran (cafe_id, nama_method, status_method) VALUES (?, ?, ?)",
    [cafeId, nama_method, status],
    (err, result) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal menambahkan pembayaran",
          [],
        );
      }
      return sendResponse(res, 201, "Pembayaran berhasil ditambahkan", {
        id: result.insertId,
      });
    },
  );
};

// Toggle/update status only
exports.updatePembayaran = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const idOrMethod = req.params.id;
  const { status_method } = req.body;

  if (status_method === undefined) {
    return sendResponse(res, 400, "status_method wajib diisi", []);
  }

  const status = status_method ? 1 : 0;

  // Ensure default methods exist so update by nama_method always works
  ensureDefaultMethods(cafeId, (seedErr) => {
    if (seedErr) {
      return sendResponse(
        res,
        500,
        seedErr?.sqlMessage || seedErr?.message || "Gagal menyiapkan data pembayaran",
        [],
      );
    }

    const numericId = Number.isFinite(Number(idOrMethod)) && String(idOrMethod).trim() !== "";

    const query = numericId
      ? "UPDATE pembayaran SET status_method = ? WHERE id = ? AND cafe_id = ?"
      : "UPDATE pembayaran SET status_method = ? WHERE nama_method = ? AND cafe_id = ?";
    const params = numericId
      ? [status, Number(idOrMethod), cafeId]
      : [status, idOrMethod, cafeId];

    db.query(query, params, (err, result) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal update pembayaran",
          [],
        );
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Pembayaran tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Pembayaran berhasil diupdate", {
        ...(numericId ? { id: Number(idOrMethod) } : { nama_method: idOrMethod }),
        status_method: status,
      });
    });
  });
};

exports.deletePembayaran = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  db.query(
    "DELETE FROM pembayaran WHERE id = ? AND cafe_id = ?",
    [id, cafeId],
    (err, result) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal hapus pembayaran",
          [],
        );
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Pembayaran tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Pembayaran berhasil dihapus", []);
    },
  );
};
