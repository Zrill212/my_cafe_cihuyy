const db = require("../config/db");
const { toPublicError } = require("../utils/publicError");

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
        const pub = toPublicError(err, "Gagal mengambil data variant");
        return sendResponse(
          res,
          pub.status,
          pub.message,
          [],
        );
      }
      const payload = (results || []).map((row) => ({
        ...row,
        harga_variant:
          row?.harga_variant == null ? null : Number(row.harga_variant),
      }));
      return sendResponse(res, 200, "Berhasil mengambil data variant", payload);
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
        const pub = toPublicError(err, "Gagal mengambil detail variant");
        return sendResponse(
          res,
          pub.status,
          pub.message,
          [],
        );
      }
      if (!results || results.length === 0) {
        return sendResponse(res, 404, "Variant tidak ditemukan", []);
      }
      const row = results[0];
      const payload = {
        ...row,
        harga_variant:
          row?.harga_variant == null ? null : Number(row.harga_variant),
      };
      return sendResponse(res, 200, "Berhasil mengambil detail variant", payload);
    },
  );
};

exports.getVariatsByNamaGroup = (req, res) => {
  const cafeId = req.query?.cafe_id;
  const namaGroup = req.params.nama_group;

  if (cafeId == null || String(cafeId).trim() === "") {
    return sendResponse(res, 400, "cafe_id wajib diisi", []);
  }

  const cafeIdNum = Number(cafeId);
  if (!Number.isFinite(cafeIdNum) || cafeIdNum <= 0) {
    return sendResponse(res, 400, "cafe_id tidak valid", []);
  }

  if (!namaGroup) {
    return sendResponse(res, 400, "nama_group wajib diisi", []);
  }

  db.query(
    "SELECT * FROM variats WHERE nama_group = ? AND cafe_id = ?",
    [namaGroup, cafeIdNum],
    (err, results) => {
      if (err) {
        const pub = toPublicError(err, "Gagal mengambil data variant");
        return sendResponse(res, pub.status, pub.message, []);
      }
      const payload = (results || []).map((row) => ({
        ...row,
        harga_variant:
          row?.harga_variant == null ? null : Number(row.harga_variant),
      }));
      return sendResponse(
        res,
        200,
        "Berhasil mengambil data variant",
        payload,
      );
    },
  );
};

exports.createVariat = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const { id_menu, label, harga_variant, harga, nama_group } = req.body;

  if (!cafeId) {
    return sendResponse(res, 401, "Unauthorized", []);
  }

  if (id_menu == null || String(id_menu).trim() === "") {
    return sendResponse(res, 400, "id_menu wajib diisi", []);
  }
  if (nama_group == null || String(nama_group).trim() === "") {
    return sendResponse(res, 400, "nama_group wajib diisi", []);
  }
  if (label == null || String(label).trim() === "") {
    return sendResponse(res, 400, "label wajib diisi", []);
  }
  const hargaInput = harga_variant ?? harga ?? 0;
  const hargaNum = Number(hargaInput);
  if (!Number.isFinite(hargaNum) || hargaNum < 0) {
    return sendResponse(res, 400, "harga_variant harus berupa angka dan tidak boleh negatif", []);
  }
  const idMenuNum = Number(id_menu);
  if (!Number.isFinite(idMenuNum) || idMenuNum <= 0) {
    return sendResponse(res, 400, "id_menu tidak valid", []);
  }

  db.query(
    "INSERT INTO variats (cafe_id, id_menu, label, harga_variant, nama_group) VALUES (?, ?, ?, ?, ?)",
    [cafeId, idMenuNum, String(label).trim(), hargaNum, String(nama_group).trim()],
    (err, result) => {
      if (err) {
        const pub = toPublicError(err, "Gagal menambahkan variant");
        return sendResponse(
          res,
          pub.status,
          pub.message,
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
  const { id_menu, label, harga_variant, harga, nama_group } = req.body;

  if (!cafeId) {
    return sendResponse(res, 401, "Unauthorized", []);
  }

  if (id_menu == null || String(id_menu).trim() === "") {
    return sendResponse(res, 400, "id_menu wajib diisi", []);
  }
  if (nama_group == null || String(nama_group).trim() === "") {
    return sendResponse(res, 400, "nama_group wajib diisi", []);
  }
  if (label == null || String(label).trim() === "") {
    return sendResponse(res, 400, "label wajib diisi", []);
  }
  const hargaInput = harga_variant ?? harga ?? 0;
  const hargaNum = Number(hargaInput);
  if (!Number.isFinite(hargaNum) || hargaNum < 0) {
    return sendResponse(res, 400, "harga_variant harus berupa angka dan tidak boleh negatif", []);
  }
  const idMenuNum = Number(id_menu);
  if (!Number.isFinite(idMenuNum) || idMenuNum <= 0) {
    return sendResponse(res, 400, "id_menu tidak valid", []);
  }
  const idNum = Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return sendResponse(res, 400, "id variant tidak valid", []);
  }

  db.query(
    "UPDATE variats SET id_menu = ?, label = ?, harga_variant = ?, nama_group = ? WHERE id = ? AND cafe_id = ?",
    [idMenuNum, String(label).trim(), hargaNum, String(nama_group).trim(), idNum, cafeId],
    (err, result) => {
      if (err) {
        const pub = toPublicError(err, "Gagal update variant");
        return sendResponse(
          res,
          pub.status,
          pub.message,
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
        const pub = toPublicError(err, "Gagal hapus variant");
        return sendResponse(
          res,
          pub.status,
          pub.message,
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
