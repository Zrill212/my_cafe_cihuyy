const db = require("../config/db");

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

exports.getVariats = (req, res) => {
  const cafeId = req.user?.cafe_id;

  db.query(
    "SELECT * FROM variats WHERE cafe_id = ?",
    [cafeId],
    (err, results) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal mengambil data variant",
          [],
        );
      }
      return sendResponse(res, 200, "Berhasil mengambil data variant", results || []);
    },
  );
};

exports.getVariatById = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  db.query(
    "SELECT * FROM variats WHERE id = ? AND cafe_id = ?",
    [id, cafeId],
    (err, results) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal mengambil detail variant",
          [],
        );
      }
      if (!results || results.length === 0) {
        return sendResponse(res, 404, "Variant tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Berhasil mengambil detail variant", results[0]);
    },
  );
};

exports.createVariat = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const { id_menu, label, harga } = req.body;

  db.query(
    "INSERT INTO variats (cafe_id, id_menu, label, harga) VALUES (?, ?, ?, ?)",
    [cafeId, id_menu ?? null, label ?? null, harga ?? null],
    (err, result) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal menambahkan variant",
          [],
        );
      }
      return sendResponse(res, 201, "Variant berhasil ditambahkan", {
        id: result.insertId,
      });
    },
  );
};

exports.updateVariat = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  const { id_menu, label, harga } = req.body;

  db.query(
    "UPDATE variats SET id_menu = ?, label = ?, harga = ? WHERE id = ? AND cafe_id = ?",
    [id_menu ?? null, label ?? null, harga ?? null, id, cafeId],
    (err, result) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal update variant",
          [],
        );
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Variant tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Variant berhasil diupdate", {});
    },
  );
};

exports.deleteVariat = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  db.query(
    "DELETE FROM variats WHERE id = ? AND cafe_id = ?",
    [id, cafeId],
    (err, result) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal hapus variant",
          [],
        );
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Variant tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Variant berhasil dihapus", {});
    },
  );
};
