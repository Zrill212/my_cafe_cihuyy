const midtransClient = require("midtrans-client");
const db = require("../config/db");
require("dotenv").config();

const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
});

function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `ORD-${ts}-${rnd}`;
}

const queryAsync = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      return resolve(results);
    });
  });
};

exports.createTransaction = async (req, res) => {
  try {
    console.log("[MIDTRANS][CREATE] body:", req.body);

    const cafeId = req.body.cafe_id;
    const meja = req.body.meja ?? req.body.meja_id;
    const nama = req.body.nama ?? "";
    const note = req.body.note ?? "";
    const promoCode = req.body.promo_code ?? null;
    const items = req.body.items ?? [];

    if (!cafeId || !meja) {
      return res.status(400).json({ error: "Terjadi masalah: cafe_id dan meja wajib diisi" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Terjadi masalah: items tidak boleh kosong" });
    }

    const normalizedItems = items
      .map((it) => {
        const id = it.id ?? it.menu_id;
        const qty = Number(it.quantity ?? it.qty ?? 1);
        const catatan = it.catatan ?? it.note ?? "";
        return {
          id: id === undefined || id === null ? null : Number(id),
          qty,
          catatan,
        };
      })
      .filter((it) => Number.isFinite(it.id) && it.id > 0);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: "Terjadi masalah: item id tidak valid" });
    }
    if (normalizedItems.some((it) => !Number.isFinite(it.qty) || it.qty <= 0)) {
      return res.status(400).json({ error: "Terjadi masalah: quantity/qty harus angka" });
    }

    const uniqueMenuIds = Array.from(new Set(normalizedItems.map((it) => it.id)));
    const placeholders = uniqueMenuIds.map(() => "?").join(",");
    const menuRows = await queryAsync(
      `SELECT id, cafe_id, nama_menu, harga, status FROM menus WHERE cafe_id = ? AND id IN (${placeholders})`,
      [cafeId, ...uniqueMenuIds],
    );

    const menuMap = new Map((menuRows || []).map((m) => [Number(m.id), m]));
    const missingIds = uniqueMenuIds.filter((id) => !menuMap.has(id));
    if (missingIds.length > 0) {
      return res.status(400).json({ error: `Terjadi masalah: menu tidak ditemukan (${missingIds.join(",")})` });
    }

    const pricedItems = normalizedItems.map((it) => {
      const menu = menuMap.get(it.id);
      const price = Number(menu.harga ?? 0);
      return {
        id: it.id,
        name: menu.nama_menu,
        price,
        quantity: it.qty,
        catatan: it.catatan,
      };
    });

    const subtotal = pricedItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      return res.status(400).json({ error: "Terjadi masalah: subtotal tidak valid" });
    }

    let discount = 0;
    if (promoCode) {
      const promoRows = await queryAsync(
        `SELECT * FROM promo
         WHERE cafe_id = ? AND kode_promo = ?
           AND CURDATE() >= mulai_date AND CURDATE() <= berakhir_date
         LIMIT 1`,
        [cafeId, promoCode],
      );

      if (promoRows && promoRows.length > 0) {
        const promo = promoRows[0];
        const minimumOrder = Number(promo.minimum_order ?? 0);
        if (subtotal >= minimumOrder) {
          const nilai = Number(promo.nilai ?? 0);
          const tipeDiskon = Number(promo.tipe_diskon ?? 0);

          discount = tipeDiskon === 1 ? Math.floor((subtotal * nilai) / 100) : nilai;
          if (!Number.isFinite(discount) || discount < 0) discount = 0;
          if (discount > subtotal) discount = subtotal;
        }
      }
    }

    const total = subtotal - discount;
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Terjadi masalah: total tidak valid" });
    }

    const orderId = generateOrderId();

    await queryAsync(
      `INSERT INTO orders (id, cafe_id, meja, nama, status, total, note, method, estimasi)
       VALUES (?, ?, ?, ?, 'proses', ?, ?, 'online', '15 mnt')`,
      [orderId, cafeId, meja, nama, Number(total), note],
    );

    for (const it of pricedItems) {
      await queryAsync(
        `INSERT INTO order_items (order_id, nama_menu, qty, harga, catatan)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, it.name, it.quantity, Number(it.price), it.catatan || ""],
      );
    }

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: parseInt(total, 10),
      },
    };

    const transaction = await snap.createTransaction(parameter);

    return res.json({
      order_id: orderId,
      subtotal,
      discount,
      total,
      snap_token: transaction.token,
      redirect_url: transaction.redirect_url,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Terjadi masalah saat membuat transaksi" });
  }
};

exports.checkStatus = async (req, res) => {
  try {
    const status = await snap.transaction.status(req.params.orderId);
    return res.json(status);
  } catch (err) {
    console.log("ERROE MIDTRANS:", err);
    return res.status(500).json({ error: "Terjadi masalah saat cek status" });
  }
};
