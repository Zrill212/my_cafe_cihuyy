const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const { toPublicError } = require("../utils/publicError");
const cache = require("../utils/cache");

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
      const pub = toPublicError(err, "Gagal mengambil data menu");
      return sendResponse(res, pub.status, pub.message, []);
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
        const pub = toPublicError(err, "Gagal mengambil detail menu");
        return sendResponse(res, pub.status, pub.message, []);
      }
      if (!results || results.length === 0) {
        return sendResponse(res, 404, "Menu tidak ditemukan", []);
      }

      const menu = results[0];
      db.query(
        "SELECT id, cafe_id, id_menu, label, nama_group, harga_variant FROM variats WHERE id_menu = ? AND cafe_id = ?",
        [id, cafeId],
        (err2, variants) => {
          if (err2) {
            const pub = toPublicError(err2, "Gagal mengambil detail menu");
            return sendResponse(res, pub.status, pub.message, []);
          }
          const payload = {
            ...menu,
            variants: (variants || []).map((v) => ({
              ...v,
              harga_variant: v?.harga_variant == null ? null : Number(v.harga_variant),
            })),
          };
          return sendResponse(res, 200, "Berhasil mengambil detail menu", payload);
        },
      );
    },
  );
};

exports.getMenuByIdPublic = (req, res) => {
  const cafeId = req.params.cafe_id;
  const id = req.params.id;

  if (cafeId == null || String(cafeId).trim() === "") {
    return sendResponse(res, 400, "cafe_id wajib diisi", []);
  }
  const cafeIdNum = Number(cafeId);
  if (!Number.isFinite(cafeIdNum) || cafeIdNum <= 0) {
    return sendResponse(res, 400, "cafe_id tidak valid", []);
  }
  const idNum = Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return sendResponse(res, 400, "id menu tidak valid", []);
  }

  db.query(
    "SELECT * FROM menus WHERE id = ? AND cafe_id = ?",
    [idNum, cafeIdNum],
    (err, results) => {
      if (err) {
        const pub = toPublicError(err, "Gagal mengambil detail menu");
        return sendResponse(res, pub.status, pub.message, []);
      }
      if (!results || results.length === 0) {
        return sendResponse(res, 404, "Menu tidak ditemukan", []);
      }

      const menu = results[0];
      db.query(
        "SELECT id, cafe_id, id_menu, label, nama_group, harga_variant FROM variats WHERE id_menu = ? AND cafe_id = ?",
        [idNum, cafeIdNum],
        (err2, variants) => {
          if (err2) {
            const pub = toPublicError(err2, "Gagal mengambil detail menu");
            return sendResponse(res, pub.status, pub.message, []);
          }
          const payload = {
            ...menu,
            variants: (variants || []).map((v) => ({
              ...v,
              harga_variant:
                v?.harga_variant == null ? null : Number(v.harga_variant),
            })),
          };
          return sendResponse(res, 200, "Berhasil mengambil detail menu", payload);
        },
      );
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
      const pub = toPublicError(err, "Gagal menambahkan menu");
      return sendResponse(res, pub.status, pub.message, []);
    }
    cache.del(cache.buildKey("menus", "public", cafeId));
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
      const pub = toPublicError(err, "Gagal update menu");
      return sendResponse(res, pub.status, pub.message, []);
    }
    if (!result || result.affectedRows === 0) {
      return sendResponse(res, 404, "Menu tidak ditemukan", []);
    }
    cache.del(cache.buildKey("menus", "public", cafeId));
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
        const pub = toPublicError(err, "Gagal hapus menu");
        return sendResponse(res, pub.status, pub.message, []);
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Menu tidak ditemukan", []);
      }
      cache.del(cache.buildKey("menus", "public", cafeId));
      return sendResponse(res, 200, "Menu berhasil dihapus", {});
    },
  );
};

exports.getMenusPublic = (req, res) => {
  const cafeId = req.params.cafe_id;

  const key = cache.buildKey("menus", "public", cafeId);
  const ttl = Number(process.env.CACHE_TTL_MENUS_PUBLIC || 120);

  cache
    .getJSON(key)
    .then((hit) => {
      if (hit) return sendResponse(res, 200, "Berhasil mengambil menu", hit);

      db.query(
        `SELECT m.*, k.nama_kategori 
     FROM menus m
     JOIN kategoris k ON m.id_kategori = k.id
     WHERE m.cafe_id = ?`,
        [cafeId],
        (err, results) => {
          if (err) {
            const pub = toPublicError(err, "Gagal mengambil menu");
            return sendResponse(res, pub.status, pub.message, []);
          }

          const payload = results || [];
          cache.setJSON(key, payload, ttl);
          return sendResponse(res, 200, "Berhasil mengambil menu", payload);
        }
      );
    })
    .catch(() => {
      db.query(
        `SELECT m.*, k.nama_kategori 
     FROM menus m
     JOIN kategoris k ON m.id_kategori = k.id
     WHERE m.cafe_id = ?`,
        [cafeId],
        (err, results) => {
          if (err) {
            const pub = toPublicError(err, "Gagal mengambil menu");
            return sendResponse(res, pub.status, pub.message, []);
          }
          return sendResponse(res, 200, "Berhasil mengambil menu", results || []);
        }
      );
    });
};