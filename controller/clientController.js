const db = require("../config/db");
const { toPublicError } = require("../utils/publicError");

const formatWibDateTime = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Jakarta", hour12: false });
};

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
    success: httpStatus >= 200 && httpStatus < 300,
  });
};

exports.initClient = (req, res) => {
  return res.status(200).json({
    status: 200,
    message: "Berhasil init client",
    data: req.clientMeta,
    success: true,
  });
};

exports.getRiwayatPembelian = (req, res) => {
  const cafeId = req.query.cafe_id;
  if (!cafeId) {
    return sendResponse(res, 400, "cafe_id wajib diisi", null);
  }

  const visitorId   = req.query.visitor_id   || req.clientMeta?.visitor_id   || null;
  const fingerprint = req.query.fingerprint  || req.clientMeta?.fingerprint  || null;
  const mejaId      = req.query.meja_id      || req.query.meja               || null;
  const limit       = Math.min(Number(req.query.limit || 20), 100);

  // ── Cek apakah tabel riwayat_pembelian ada ──────────────────────────────
  // Jika tidak ada, fallback langsung query orders tanpa JOIN
  db.query("SHOW TABLES LIKE 'riwayat_pembelian'", [], (errCheck, tableExists) => {
    const hasRiwayatTable = !errCheck && tableExists && tableExists.length > 0;

    if (hasRiwayatTable && (visitorId || fingerprint)) {
      // ── Query DENGAN riwayat_pembelian (join by order_id, bukan product_id) ──
      let sqlOrders = `
        SELECT DISTINCT
          o.id,
          o.cafe_id,
          o.meja,
          o.nama,
          o.status,
          o.total,
          o.method,
          o.estimasi,
          o.created_at
        FROM orders o
        INNER JOIN riwayat_pembelian rb
          ON rb.order_id = o.id
          AND rb.cafe_id = o.cafe_id
        WHERE o.cafe_id = ?`;

      const valsOrders = [cafeId];

      if (visitorId) {
        sqlOrders += ` AND rb.visitor_id = ?`;
        valsOrders.push(visitorId);
      }
      if (fingerprint) {
        sqlOrders += ` AND rb.fingerprint = ?`;
        valsOrders.push(fingerprint);
      }
      if (mejaId) {
        sqlOrders += ` AND o.meja = ?`;
        valsOrders.push(String(mejaId));
      }

      sqlOrders += ` ORDER BY o.created_at DESC LIMIT ?`;
      valsOrders.push(limit);

      queryOrdersAndItems(res, cafeId, sqlOrders, valsOrders);

    } else {
      // ── Fallback: query orders langsung tanpa JOIN riwayat_pembelian ──
      // Identifikasi pakai meja + cafe_id saja
      let sqlOrders = `
        SELECT
          o.id,
          o.cafe_id,
          o.meja,
          o.nama,
          o.status,
          o.total,
          o.method,
          o.estimasi,
          o.created_at
        FROM orders o
        WHERE o.cafe_id = ?`;

      const valsOrders = [cafeId];

      if (mejaId) {
        sqlOrders += ` AND o.meja = ?`;
        valsOrders.push(String(mejaId));
      }

      sqlOrders += ` ORDER BY o.created_at DESC LIMIT ?`;
      valsOrders.push(limit);

      queryOrdersAndItems(res, cafeId, sqlOrders, valsOrders);
    }
  });
};

// ── Helper: ambil orders lalu ambil items-nya ──────────────────────────────
function queryOrdersAndItems(res, cafeId, sqlOrders, valsOrders) {
  db.query(sqlOrders, valsOrders, (err, orders) => {
    if (err) {
      console.error("[riwayat-pembelian] query orders error:", err);
      const pub = toPublicError(err, "Gagal mengambil riwayat pembelian");
      return sendResponse(res, pub.status, pub.message, []);
    }

    if (!orders || orders.length === 0) {
      return sendResponse(res, 200, "Berhasil mengambil riwayat pembelian", []);
    }

    const orderIds    = orders.map((o) => o.id);
    const placeholders = orderIds.map(() => "?").join(",");

    const sqlItems = `
      SELECT
        oi.order_id,
        oi.nama_menu,
        oi.qty,
        oi.harga,
        oi.catatan,
        COALESCE(m.image_url, '') AS image
      FROM order_items oi
      LEFT JOIN menus m
        ON m.nama_menu = oi.nama_menu
        AND m.cafe_id = ?
      WHERE oi.order_id IN (${placeholders})
      ORDER BY oi.id ASC`;

    db.query(sqlItems, [cafeId, ...orderIds], (err2, items) => {
      if (err2) {
        console.error("[riwayat-pembelian] query items error:", err2);
        const pub = toPublicError(err2, "Gagal mengambil detail item pesanan");
        return sendResponse(res, pub.status, pub.message, []);
      }

      const itemsByOrderId = new Map();
      for (const it of items || []) {
        const key = it.order_id;
        if (!itemsByOrderId.has(key)) itemsByOrderId.set(key, []);
        itemsByOrderId.get(key).push({
          nama_produk:   it.nama_menu  ?? "",
          gambar_produk: it.image      ?? "",
          harga_produk:  Number(it.harga ?? 0),
          jumlah:        Number(it.qty  ?? 1),
          catatan:       it.catatan    ?? "",
        });
      }

      const payload = orders.map((o) => ({
        order_id:          o.id,
        cafe_id:           o.cafe_id,
        nama_pemesan:      o.nama     ?? "",
        meja:              o.meja,
        status:            o.status   ?? "proses",
        total_semua_item:  Number(o.total ?? 0),
        waktu:             formatWibDateTime(o.created_at),
        items:             itemsByOrderId.get(o.id) || [],
      }));

      return sendResponse(res, 200, "Berhasil mengambil riwayat pembelian", payload);
    });
  });
}