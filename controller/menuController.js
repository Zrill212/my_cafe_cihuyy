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

  return {
    mime: "image/jpeg",
    buffer: Buffer.from(value, "base64"),
  };
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

const saveImageIfAny = (req) => {
  const assetDir = ensureAssetDir();

  if (req.file && req.file.buffer) {
    const ext = extFromMime(req.file.mimetype);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    fs.writeFileSync(path.join(assetDir, filename), req.file.buffer);
    return buildPublicUrl(filename);
  }

  // Support image_url base64 field from client
  const base64 = req.body?.image_base64 || req.body?.imageBase64 || req.body?.image_url;
  const parsed = parseBase64Image(base64);
  if (parsed && parsed.buffer && parsed.buffer.length > 0) {
    const ext = extFromMime(parsed.mime);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    fs.writeFileSync(path.join(assetDir, filename), parsed.buffer);
    return buildPublicUrl(filename);
  }

  return null;
};

exports.getMenus = (req, res) => {
  const cafeId = req.user?.cafe_id;

  db.query("SELECT * FROM menus WHERE cafe_id = ?", [cafeId], (err, results) => {
    if (err) {
      return sendResponse(
        res,
        500,
        err?.sqlMessage || err?.message || "Gagal mengambil data menu",
        [],
      );
    }
    return sendResponse(res, 200, "Berhasil mengambil data menu", results || []);
  });
};

exports.getMenuById = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  db.query(
    "SELECT * FROM menus WHERE id = ? AND cafe_id = ?",
    [id, cafeId],
    (err, results) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal mengambil detail menu",
          [],
        );
      }
      if (!results || results.length === 0) {
        return sendResponse(res, 404, "Menu tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Berhasil mengambil detail menu", results[0]);
    },
  );
};

exports.createMenu = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const { id_kategori, nama_menu, deskripsi, harga, status, image_url } = req.body;

  let imageUrl = null;
  if (image_url) {
    if (typeof image_url === "string" && image_url.startsWith("data:")) {
      // Treat as base64 upload; convert to short URL
      imageUrl = saveImageIfAny(req);
    } else {
      // Use provided URL directly
      imageUrl = image_url;
    }
  } else {
    // Fallback to other upload fields
    imageUrl = saveImageIfAny(req);
  }

  const query = imageUrl
    ? "INSERT INTO menus (cafe_id, id_kategori, nama_menu, deskripsi, harga, status, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)"
    : "INSERT INTO menus (cafe_id, id_kategori, nama_menu, deskripsi, harga, status) VALUES (?, ?, ?, ?, ?, ?)";
  const params = imageUrl
    ? [
        cafeId,
        id_kategori ?? null,
        nama_menu ?? null,
        deskripsi ?? "",
        harga ?? null,
        status ?? 0,
        imageUrl,
      ]
    : [
        cafeId,
        id_kategori ?? null,
        nama_menu ?? null,
        deskripsi ?? "",
        harga ?? null,
        status ?? 0,
      ];

  db.query(query, params, (err, result) => {
    if (err) {
      return sendResponse(
        res,
        500,
        err?.sqlMessage || err?.message || "Gagal menambahkan menu",
        [],
      );
    }
    return sendResponse(res, 201, "Menu berhasil ditambahkan", {
      id: result.insertId,
      ...(imageUrl && { image_url: imageUrl }),
    });
  });
};

exports.updateMenu = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;
  const { id_kategori, nama_menu, deskripsi, harga, status, image_url } = req.body;

  let imageUrl = undefined;
  if (image_url !== undefined) {
    if (typeof image_url === "string" && image_url.startsWith("data:")) {
      // Treat as base64 upload; convert to short URL
      imageUrl = saveImageIfAny(req);
    } else {
      // Use provided URL directly
      imageUrl = image_url;
    }
  } else {
    // Check other upload fields
    const uploaded = saveImageIfAny(req);
    if (uploaded) imageUrl = uploaded;
  }

  const query = imageUrl !== undefined
    ? "UPDATE menus SET id_kategori = ?, nama_menu = ?, deskripsi = ?, harga = ?, status = ?, image_url = COALESCE(?, image_url) WHERE id = ? AND cafe_id = ?"
    : "UPDATE menus SET id_kategori = ?, nama_menu = ?, deskripsi = ?, harga = ?, status = ? WHERE id = ? AND cafe_id = ?";
  const params = imageUrl !== undefined
    ? [
        id_kategori ?? null,
        nama_menu,
        deskripsi,
        harga,
        status,
        imageUrl,
        id,
        cafeId,
      ]
    : [
        id_kategori ?? null,
        nama_menu,
        deskripsi,
        harga,
        status,
        id,
        cafeId,
      ];

  db.query(query, params, (err, result) => {
    if (err) {
      return sendResponse(
        res,
        500,
        err?.sqlMessage || err?.message || "Gagal update menu",
        [],
      );
    }
    if (!result || result.affectedRows === 0) {
      return sendResponse(res, 404, "Menu tidak ditemukan", []);
    }
    return sendResponse(res, 200, "Menu berhasil diupdate", {
      id: parseInt(id),
      ...(imageUrl !== undefined && { image_url: imageUrl }),
    });
  });
};

exports.deleteMenu = (req, res) => {
  const cafeId = req.user?.cafe_id;
  const id = req.params.id;

  db.query(
    "DELETE FROM menus WHERE id = ? AND cafe_id = ?",
    [id, cafeId],
    (err, result) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || err?.message || "Gagal hapus menu",
          [],
        );
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Menu tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Menu berhasil dihapus", {});
    },
  );
};

exports.getMenusPublic = (req, res) => {
  const cafeId = req.params.cafe_id;

  db.query(
    `SELECT m.*, k.nama_kategori 
     FROM menus m
     JOIN kategoris k ON m.id_kategori = k.id
     WHERE m.cafe_id = ?`,
    [cafeId],
    (err, results) => {
      if (err) {
        return sendResponse(
          res,
          500,
          err?.sqlMessage || "Gagal mengambil menu",
          []
        );
      }

      return sendResponse(res, 200, "Berhasil mengambil menu", results || []);
    }
  );
};