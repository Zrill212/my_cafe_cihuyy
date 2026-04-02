const db = require("../config/db");

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

const buildDateFilter = (filterType) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  switch (filterType) {
    case "hari":
      return { start: `${year}-${month}-${day} 00:00:00`, end: `${year}-${month}-${day} 23:59:59` };
    case "minggu": {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      const sw = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, "0")}-${String(startOfWeek.getDate()).padStart(2, "0")} 00:00:00`;
      const ew = `${endOfWeek.getFullYear()}-${String(endOfWeek.getMonth() + 1).padStart(2, "0")}-${String(endOfWeek.getDate()).padStart(2, "0")} 23:59:59`;
      return { start: sw, end: ew };
    }
    case "bulan":
      return {
        start: `${year}-${month}-01 00:00:00`,
        end: `${year}-${month}-31 23:59:59`,
      };
    default:
      return null;
  }
};

exports.getLaporan = (req, res) => {
  const cafeId = req.user?.cafe_id || req.query?.cafe_id;
  const filter = req.query.filter || "hari";

  if (!["hari", "minggu", "bulan"].includes(filter)) {
    return sendResponse(res, 400, "Filter harus hari, minggu, atau bulan", []);
  }

  const dateRange = buildDateFilter(filter);
  const whereClause = dateRange
    ? "WHERE o.cafe_id = ? AND o.created_at BETWEEN ? AND ?"
    : "WHERE o.cafe_id = ?";
  const params = dateRange ? [cafeId, dateRange.start, dateRange.end] : [cafeId];

  const queries = {
    totalPendapatan: `SELECT COALESCE(SUM(total), 0) AS total FROM orders o ${whereClause}`,
    totalPesanan: `SELECT COUNT(*) AS total FROM orders o ${whereClause}`,
    rataRataOrder: `SELECT COALESCE(AVG(total), 0) AS rata_rata FROM orders o ${whereClause}`,
    kategoriTerlaris: `
      SELECT 
        k.nama_kategori,
        COALESCE(SUM(oi.qty), 0) AS total_qty,
        COALESCE(SUM(oi.qty * oi.harga), 0) AS total_revenue
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN menus m ON oi.nama_menu = m.nama_menu AND m.cafe_id = o.cafe_id
      JOIN kategoris k ON m.id_kategori = k.id
      ${whereClause}
      GROUP BY k.id, k.nama_kategori
      ORDER BY total_qty DESC
      LIMIT 5
    `,
  };

  db.query(queries.totalPendapatan, params, (err1, res1) => {
    if (err1) {
      return sendResponse(res, 500, err1?.sqlMessage || err1?.message || "Gagal mengambil total pendapatan", []);
    }

    db.query(queries.totalPesanan, params, (err2, res2) => {
      if (err2) {
        return sendResponse(res, 500, err2?.sqlMessage || err2?.message || "Gagal mengambil total pesanan", []);
      }

      db.query(queries.rataRataOrder, params, (err3, res3) => {
        if (err3) {
          return sendResponse(res, 500, err3?.sqlMessage || err3?.message || "Gagal mengambil rata-rata order", []);
        }

        db.query(queries.kategoriTerlaris, params, (err4, res4) => {
          if (err4) {
            return sendResponse(res, 500, err4?.sqlMessage || err4?.message || "Gagal mengambil kategori terlaris", []);
          }

          const laporan = {
            filter,
            periode: dateRange || "semua",
            total_pendapatan: res1[0]?.total || 0,
            total_pesanan: res2[0]?.total || 0,
            rata_rata_order: parseFloat(res3[0]?.rata_rata || 0).toFixed(2),
            kategori_terlaris: res4 || [],
          };

          return sendResponse(res, 200, "Berhasil mengambil laporan", laporan);
        });
      });
    });
  });
};
