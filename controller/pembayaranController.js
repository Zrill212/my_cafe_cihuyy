const db = require("../config/db");
const { toPublicError } = require("../utils/publicError");

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

const midtransClient = require('midtrans-client');

const isMidtransProduction = () => {
  const raw = String(process.env.MIDTRANS_IS_PRODUCTION || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "y";
};

const snap = new midtransClient.Snap({
  isProduction: isMidtransProduction(),
  serverKey: process.env.MIDTRANS_SERVER_KEY
});

const DEFAULT_METHODS = ["tunai", "online", "transfer_bank", "ewalet_manual"];

const ensureDefaultMethods = (cafeId, cb) => {
  db.query(
    "SELECT * FROM pembayaran WHERE cafe_id = ? ORDER BY id ASC",
    [cafeId],
    (err, rows) => {
      if (err) return cb(err);

      if (rows && rows.length > 0) {
        const hasQris = rows.some((r) => String(r.nama_method).toLowerCase() === "qris");
        const hasOnline = rows.some((r) => String(r.nama_method).toLowerCase() === "online");

        if (hasQris) {
          db.query(
            "UPDATE pembayaran SET nama_method = 'online' WHERE cafe_id = ? AND LOWER(nama_method) = 'qris'",
            [cafeId],
            (uErr) => {
              if (uErr) return cb(uErr);
              db.query(
                "SELECT * FROM pembayaran WHERE cafe_id = ? ORDER BY id ASC",
                [cafeId],
                (reErr, rowsAfter) => {
                  if (reErr) return cb(reErr);
                  return cb(null, rowsAfter || []);
                },
              );
            },
          );
          return;
        }

        if (!hasOnline) {
          db.query(
            "INSERT INTO pembayaran (cafe_id, nama_method, status_method) VALUES (?, 'online', 0)",
            [cafeId],
            (insErr) => {
              if (insErr) return cb(insErr);
              db.query(
                "SELECT * FROM pembayaran WHERE cafe_id = ? ORDER BY id ASC",
                [cafeId],
                (reErr2, rowsAfter2) => {
                  if (reErr2) return cb(reErr2);
                  return cb(null, rowsAfter2 || []);
                },
              );
            },
          );
          return;
        }

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

exports.getPembayaranPublic = (req, res) => {
  const cafeId = req.query.cafe_id || req.query.cafeId;
  if (!cafeId) {
    return sendResponse(res, 400, "cafe_id wajib diisi", []);
  }

  ensureDefaultMethods(cafeId, (err, rows) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil data pembayaran");
      return sendResponse(res, pub.status, pub.message, []);
    }

    const active = (rows || []).filter((r) => Number(r.status_method || 0) === 1);
    return sendResponse(res, 200, "Berhasil mengambil data pembayaran", active);
  });
};

exports.getPembayaran = (req, res) => {
  const cafeId = req.user?.cafe_id;

  ensureDefaultMethods(cafeId, (err, rows) => {
    if (err) {
      const pub = toPublicError(err, "Gagal mengambil data pembayaran");
      return sendResponse(res, pub.status, pub.message, []);
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
        const pub = toPublicError(err, "Gagal mengambil detail pembayaran");
        return sendResponse(res, pub.status, pub.message, []);
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
        const pub = toPublicError(err, "Gagal menambahkan pembayaran");
        return sendResponse(res, pub.status, pub.message, []);
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
      const pub = toPublicError(seedErr, "Gagal menyiapkan data pembayaran");
      return sendResponse(res, pub.status, pub.message, []);
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
        const pub = toPublicError(err, "Gagal update pembayaran");
        return sendResponse(res, pub.status, pub.message, []);
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
        const pub = toPublicError(err, "Gagal hapus pembayaran");
        return sendResponse(res, pub.status, pub.message, []);
      }
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Pembayaran tidak ditemukan", []);
      }
      return sendResponse(res, 200, "Pembayaran berhasil dihapus", []);
    },
  );
};

// ======================= MIDTRANS PAYMENT =======================

// CREATE PAYMENT
exports.createPayment = async (req, res) => {
  try {
    const cafeId = req.user?.cafe_id;
    const amount = 125000;

    if (!cafeId) {
      return sendResponse(res, 400, "Cafe tidak ditemukan", []);
    }

    const orderId = "ORDER-" + Date.now();

    db.query(
      `INSERT INTO pembayaran (cafe_id, order_id, total, status)
       VALUES (?, ?, ?, 'pending')`,
      [cafeId, orderId, amount],
      async (err) => {
        if (err) {
          const pub = toPublicError(err, "Gagal menyimpan transaksi");
          return sendResponse(res, pub.status, pub.message, []);
        }

        try {
          const parameter = {
            transaction_details: {
              order_id: orderId,
              gross_amount: amount,
            },
          };

          const midtransRes = await snap.createTransaction(parameter);

          db.query(
            `UPDATE pembayaran SET midtrans_token=? WHERE order_id=?`,
            [midtransRes.token, orderId]
          );

          return sendResponse(res, 200, "Berhasil membuat pembayaran", {
            token: midtransRes.token,
          });

        } catch (midErr) {
          console.error(midErr);
          return sendResponse(res, 500, "Gagal ke Midtrans", []);
        }
      }
    );

  } catch (err) {
    console.error(err);
    return sendResponse(res, 500, "Error server", []);
  }
};


// WEBHOOK MIDTRANS (VALIDASI + SUBSCRIPTION)
exports.handleWebhook = (req, res) => {
  try {
    const data = req.body;

    console.log("WEBHOOK MASUK:", data); // debug penting

    const orderId = data.order_id;
    const status = data.transaction_status;

    let finalStatus = "pending";

    if (status === "settlement") {
      finalStatus = "paid";
    } else if (status === "expire" || status === "cancel") {
      finalStatus = "failed";
    }

    // update status pembayaran
    db.query(
      `UPDATE pembayaran SET status=? WHERE order_id=?`,
      [finalStatus, orderId],
      (err) => {
        if (err) {
          console.error(err);
          return res.sendStatus(500);
        }

        // kalau berhasil bayar
        if (finalStatus === "paid") {
          db.query(
            `SELECT cafe_id FROM pembayaran WHERE order_id=?`,
            [orderId],
            (err2, rows) => {
              if (err2 || !rows.length) {
                console.error(err2);
                return res.sendStatus(500);
              }

              const cafeId = rows[0].cafe_id;

              // ✅ simpan ke tabel subscriptions (HISTORI)
              db.query(
                `INSERT INTO subscriptions 
                 (cafe_id, order_id, status, start_date, end_date)
                 VALUES (?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY))`,
                [cafeId, orderId],
                (err3) => {
                  if (err3) console.error(err3);
                }
              );

              // ✅ update tabel cafe (STATUS AKTIF)
              db.query(
                `UPDATE cafe 
                 SET subscription_status='active',
                     expired_at = DATE_ADD(NOW(), INTERVAL 30 DAY)
                 WHERE id=?`,
                [cafeId],
                (err4) => {
                  if (err4) console.error(err4);
                }
              );
            }
          );
        }

        return res.sendStatus(200);
      }
    );

  } catch (err) {
    console.error(err);
    return res.sendStatus(500);
  }
};