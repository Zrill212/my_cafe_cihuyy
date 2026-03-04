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

const ensureAssetDir = () => {
  const assetDir = path.join(__dirname, "..", "asset");
  fs.mkdirSync(assetDir, { recursive: true });
  return assetDir;
};

const parseBase64Image = (value) => {
  if (!value || typeof value !== "string") return null;

  const match = value.match(/^data:(image\/\w+);base64,(.+)$/);
  if (match) {
    return {
      mime: match[1],
      buffer: Buffer.from(match[2], "base64"),
    };
  }

  return null;
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

const saveQrisImageIfBase64 = (value) => {
  const parsed = parseBase64Image(value);
  if (!parsed || !parsed.buffer || parsed.buffer.length === 0) return null;
  const assetDir = ensureAssetDir();
  const ext = extFromMime(parsed.mime);
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  fs.writeFileSync(path.join(assetDir, filename), parsed.buffer);
  return buildPublicUrl(filename);
};

exports.getQris = (req, res) => {
  const cafeId = req.user?.cafe_id;
  db.query("SELECT * FROM qris WHERE cafe_id = ? ORDER BY id DESC", [cafeId], (err, results) => {
    if (err) {
      return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal mengambil data QRIS", []);
    }
    return sendResponse(res, 200, "Berhasil mengambil data QRIS", results || []);
  });
};

exports.getQrisById = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  db.query("SELECT * FROM qris WHERE id = ? AND cafe_id = ?", [id, cafeId], (err, results) => {
    if (err) {
      return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal mengambil detail QRIS", []);
    }
    if (!results || results.length === 0) {
      return sendResponse(res, 404, "QRIS tidak ditemukan", []);
    }
    return sendResponse(res, 200, "Berhasil mengambil detail QRIS", results[0]);
  });
};

exports.createQris = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const nama_merchant = req.body?.nama_merchant ?? req.body?.merchant_name;
  const nomorRaw = req.body?.nomor_merchant ?? req.body?.nmid;
  const biaya_type = req.body?.biaya_type ?? req.body?.fee_type ?? null;
  const biaya_transaksi_qris =
    req.body?.biaya_transaksi_qris ?? req.body?.fee_value ?? null;

  let qris_image = req.body?.qris_image ?? req.body?.qr_image;

  if (!nama_merchant) return sendResponse(res, 400, "nama_merchant wajib diisi", []);
  if (nomorRaw === undefined || nomorRaw === null || nomorRaw === "") {
    return sendResponse(res, 400, "nomor_merchant wajib diisi", []);
  }
  if (!qris_image) return sendResponse(res, 400, "qris_image wajib diisi", []);

  const nomor_merchant = Number(nomorRaw);
  if (!Number.isFinite(nomor_merchant)) {
    return sendResponse(res, 400, "nomor_merchant harus angka", []);
  }

  const savedUrl = saveQrisImageIfBase64(qris_image);
  if (savedUrl) qris_image = savedUrl;

  db.query(
    "INSERT INTO qris (cafe_id, nama_merchant, nomor_merchant, qris_image, biaya_type, biaya_transaksi_qris) VALUES (?, ?, ?, ?, ?, ?)",
    [
      cafeId,
      nama_merchant,
      nomor_merchant,
      qris_image,
      biaya_type,
      biaya_transaksi_qris,
    ],
    (err, result) => {
      if (err) {
        return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal menambahkan QRIS", []);
      }
      return sendResponse(res, 201, "QRIS berhasil ditambahkan", { id: result.insertId });
    },
  );
};

exports.updateQris = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  const nama_merchant = req.body?.nama_merchant ?? req.body?.merchant_name;
  const nomorRaw = req.body?.nomor_merchant ?? req.body?.nmid;
  const biaya_type = req.body?.biaya_type ?? req.body?.fee_type;
  const biaya_transaksi_qris =
    req.body?.biaya_transaksi_qris ?? req.body?.fee_value;
  let qris_image = req.body?.qris_image ?? req.body?.qr_image;

  const nomor_merchant =
    nomorRaw === undefined || nomorRaw === null || nomorRaw === "" ? undefined : Number(nomorRaw);
  if (nomor_merchant !== undefined && !Number.isFinite(nomor_merchant)) {
    return sendResponse(res, 400, "nomor_merchant harus angka", []);
  }

  if (qris_image) {
    const savedUrl = saveQrisImageIfBase64(qris_image);
    if (savedUrl) qris_image = savedUrl;
  }

  db.query(
    "UPDATE qris SET nama_merchant = COALESCE(?, nama_merchant), nomor_merchant = COALESCE(?, nomor_merchant), qris_image = COALESCE(?, qris_image), biaya_type = COALESCE(?, biaya_type), biaya_transaksi_qris = COALESCE(?, biaya_transaksi_qris) WHERE id = ? AND cafe_id = ?",
    [
      nama_merchant ?? null,
      nomor_merchant ?? null,
      qris_image ?? null,
      biaya_type ?? null,
      biaya_transaksi_qris ?? null,
      id,
      cafeId,
    ],
    (err, result) => {
      if (err) {
        return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal update QRIS", []);
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "QRIS tidak ditemukan", []);
      }
      return sendResponse(res, 200, "QRIS berhasil diupdate", {});
    },
  );
};

exports.deleteQris = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  db.query("DELETE FROM qris WHERE id = ? AND cafe_id = ?", [id, cafeId], (err, result) => {
    if (err) {
      return sendResponse(res, 500, err?.sqlMessage || err?.message || "Gagal hapus QRIS", []);
    }
    if (!result || result.affectedRows === 0) {
      return sendResponse(res, 404, "QRIS tidak ditemukan", []);
    }
    return sendResponse(res, 200, "QRIS berhasil dihapus", []);
  });
};
