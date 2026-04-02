const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { toPublicError } = require("../utils/publicError");

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }
  return false;
};

const buildSettingsObject = (rows) => {
  const settingsObj = {};
  (rows || []).forEach((setting) => {
    settingsObj[setting.setting_key] = setting.setting_value;
  });
  return settingsObj;
};

const normalizeCafeSubscription = (row) => {
  const rawStatus = row?.subscription_status || row?.status_langganan || null;
  const activeUntil = row?.subscription_expires || row?.active_until || row?.expired_at || null;

  let normalizedStatus = rawStatus;
  if (!normalizedStatus && activeUntil) {
    normalizedStatus = new Date(activeUntil).getTime() >= Date.now() ? "active" : "expired";
  }

  return {
    ...row,
    cafe_id: row?.cafe_id ?? row?.id ?? null,
    subscription_plan_name:
      row?.subscription_plan_name ?? row?.plan_name ?? row?.subscription_plan ?? null,
    subscription_plan:
      row?.subscription_plan ?? row?.subscription_plan_name ?? row?.plan_name ?? null,
    subscription_status: normalizedStatus,
    subscription_expires: activeUntil,
    registered_at: row?.registered_at ?? row?.created_at ?? row?.admin_created_at ?? null,
  };
};

const queryAsync = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      return resolve(results);
    });
  });
};

const getTableColumns = async (tableName) => {
  try {
    const rows = await queryAsync(`SHOW COLUMNS FROM ${tableName}`, []);
    return new Set((rows || []).map((row) => row.Field));
  } catch (_) {
    return new Set();
  }
};

const hasColumn = (columns, columnName) => columns instanceof Set && columns.has(columnName);

const hasAnyColumns = (columns, columnNames) => columnNames.some((columnName) => hasColumn(columns, columnName));

const insertActivityLog = async (payload = {}) => {
  const columns = await getTableColumns("activity_logs");
  if (!columns.size) return;

  if (hasAnyColumns(columns, ["action", "description", "cafe_id", "admin_id", "ip_address"])) {
    const fieldNames = [];
    const placeholders = [];
    const values = [];

    if (hasColumn(columns, "cafe_id") && payload.cafe_id !== undefined) {
      fieldNames.push("cafe_id");
      placeholders.push("?");
      values.push(payload.cafe_id);
    }
    if (hasColumn(columns, "admin_id") && payload.admin_id !== undefined) {
      fieldNames.push("admin_id");
      placeholders.push("?");
      values.push(payload.admin_id);
    }
    if (hasColumn(columns, "action")) {
      fieldNames.push("action");
      placeholders.push("?");
      values.push(payload.action || payload.activity || "SYSTEM");
    }
    if (hasColumn(columns, "description")) {
      fieldNames.push("description");
      placeholders.push("?");
      values.push(payload.description || payload.activity || payload.action || "Aktivitas sistem");
    }
    if (hasColumn(columns, "ip_address") && payload.ip_address !== undefined) {
      fieldNames.push("ip_address");
      placeholders.push("?");
      values.push(payload.ip_address);
    }

    if (fieldNames.length > 0) {
      await queryAsync(
        `INSERT INTO activity_logs (${fieldNames.join(", ")}) VALUES (${placeholders.join(", ")})`,
        values,
      );
    }
    return;
  }

  if (hasColumn(columns, "activity")) {
    const fieldNames = [];
    const placeholders = [];
    const values = [];

    if (hasColumn(columns, "user_id") && payload.user_id !== undefined) {
      fieldNames.push("user_id");
      placeholders.push("?");
      values.push(payload.user_id);
    }

    fieldNames.push("activity");
    placeholders.push("?");
    values.push(payload.description || payload.activity || payload.action || "Aktivitas sistem");

    await queryAsync(
      `INSERT INTO activity_logs (${fieldNames.join(", ")}) VALUES (${placeholders.join(", ")})`,
      values,
    );
  }
};

exports.login = async (req, res) => {
  try {
    console.log("[SUPERADMIN LOGIN] Request body:", req.body);
    
    const { email, password } = req.body;

    if (!email || !password) {
      console.log("[SUPERADMIN LOGIN] Missing email or password");
      return sendResponse(res, 400, "Email dan password wajib diisi", null);
    }

    // Check JWT_SECRET
    if (!process.env.JWT_SECRET) {
      console.error("[SUPERADMIN LOGIN] JWT_SECRET not configured!");
      return sendResponse(res, 500, "Server configuration error: JWT_SECRET not set", null);
    }

    console.log("[SUPERADMIN LOGIN] Querying database for email:", email);
    const superAdmins = await queryAsync(
      "SELECT * FROM super_admins WHERE email = ?",
      [email]
    );

    if (!superAdmins || superAdmins.length === 0) {
      console.log("[SUPERADMIN LOGIN] Super admin not found");
      return sendResponse(res, 401, "Email atau password salah", null);
    }

    const superAdmin = superAdmins[0];
    console.log("[SUPERADMIN LOGIN] Found super admin:", superAdmin.email);
    
    const isPasswordValid = await bcrypt.compare(password, superAdmin.password);
    console.log("[SUPERADMIN LOGIN] Password valid:", isPasswordValid);

    if (!isPasswordValid) {
      console.log("[SUPERADMIN LOGIN] Invalid password");
      return sendResponse(res, 401, "Email atau password salah", null);
    }

    console.log("[SUPERADMIN LOGIN] Generating JWT token...");
    const token = jwt.sign(
      {
        id: superAdmin.id,
        email: superAdmin.email,
        username: superAdmin.username,
        role: "superadmin",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("[SUPERADMIN LOGIN] Login successful");
    return sendResponse(res, 200, "Login berhasil", {
      token,
      superAdmin: {
        id: superAdmin.id,
        username: superAdmin.username,
        email: superAdmin.email,
        full_name: superAdmin.full_name,
      },
    });
  } catch (error) {
    console.error("[SUPERADMIN LOGIN] Error:", error);
    console.error("[SUPERADMIN LOGIN] Error stack:", error.stack);
    return sendResponse(res, 500, `Terjadi kesalahan pada server: ${error.message}`, null);
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const totalCafes = await queryAsync("SELECT COUNT(*) as count FROM cafe", []);
    
    const activeCafes = await queryAsync(
      "SELECT COUNT(DISTINCT cafe_id) as count FROM admins WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
      []
    );

    const totalAdmins = await queryAsync("SELECT COUNT(*) as count FROM admins", []);

    const totalRevenue = await queryAsync(
      "SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'selesai'",
      []
    );

    const totalOrders = await queryAsync(
      "SELECT COUNT(*) as count FROM orders",
      []
    );

    const totalMenus = await queryAsync(
      "SELECT COUNT(*) as count FROM menus",
      []
    );

    const recentCafes = await queryAsync(
      "SELECT c.*, a.email as admin_email, a.username as admin_username FROM cafe c LEFT JOIN admins a ON c.id = a.cafe_id ORDER BY c.id DESC LIMIT 5",
      []
    );

    const topCafes = await queryAsync(
      `SELECT c.id, c.nama_cafe, c.logo_cafe, 
              COUNT(DISTINCT o.id) as total_orders,
              COALESCE(SUM(o.total), 0) as total_revenue
       FROM cafe c
       LEFT JOIN orders o ON c.id = o.cafe_id AND o.status = 'selesai'
       GROUP BY c.id
       ORDER BY total_revenue DESC
       LIMIT 5`,
      []
    );

    return sendResponse(res, 200, "Berhasil mengambil statistik dashboard", {
      stats: {
        totalCafes: totalCafes[0].count,
        activeCafes: activeCafes[0].count,
        totalAdmins: totalAdmins[0].count,
        totalRevenue: parseFloat(totalRevenue[0].total || 0),
        totalOrders: totalOrders[0].count,
        totalMenus: totalMenus[0].count,
      },
      recentCafes,
      topCafes,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    const pub = toPublicError(error, "Gagal mengambil statistik dashboard");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.getSubscriptionBalance = async (req, res) => {
  try {
    // Total pemasukan dari pembayaran langganan (paid)
    const totalRows = await queryAsync(
      `SELECT
         COALESCE(SUM(expected_amount), 0) as total_amount,
         COUNT(*) as total_transactions
       FROM subscription_transactions
       WHERE status = 'paid'`,
      [],
    );

    // Breakdown per cafe (untuk ditampilkan di tabel/summary)
    const byCafe = await queryAsync(
      `SELECT
         st.cafe_id,
         MAX(c.nama_cafe) as nama_cafe,
         COALESCE(SUM(st.expected_amount), 0) as total_amount,
         COUNT(*) as total_transactions,
         MAX(st.updated_at) as last_paid_at
       FROM subscription_transactions st
       LEFT JOIN cafe c ON c.id = st.cafe_id
       WHERE st.status = 'paid'
       GROUP BY st.cafe_id
       ORDER BY total_amount DESC`,
      [],
    );

    const row = totalRows && totalRows.length > 0 ? totalRows[0] : {};
    return sendResponse(res, 200, "Berhasil mengambil saldo pembayaran langganan", {
      total_amount: Number(row.total_amount || 0),
      total_transactions: Number(row.total_transactions || 0),
      by_cafe: (byCafe || []).map((r) => ({
        cafe_id: r.cafe_id,
        nama_cafe: r.nama_cafe || null,
        total_amount: Number(r.total_amount || 0),
        total_transactions: Number(r.total_transactions || 0),
        last_paid_at: r.last_paid_at || null,
      })),
    });
  } catch (error) {
    console.error("Get subscription balance error:", error);
    const pub = toPublicError(error, "Gagal mengambil saldo pembayaran langganan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.getActivities = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const activities = await queryAsync(
      `SELECT al.*, c.nama_cafe, a.username as admin_username
       FROM activity_logs al
       LEFT JOIN cafe c ON al.cafe_id = c.id
       LEFT JOIN admins a ON al.admin_id = a.id
       ORDER BY al.created_at DESC
       LIMIT ?`,
      [limit]
    );

    return sendResponse(res, 200, "Berhasil mengambil aktivitas", activities);
  } catch (error) {
    console.error("Get activities error:", error);
    const pub = toPublicError(error, "Gagal mengambil aktivitas");
    return sendResponse(res, pub.status, pub.message, []);
  }
};

exports.getAllCafes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;
    const cafeColumns = await getTableColumns("cafe");
    const hasSubscriptionsTable = (await getTableColumns("cafe_subscriptions")).size > 0;
    const hasPlansTable = (await getTableColumns("subscription_plans")).size > 0;

    let whereClause = "";
    let params = [];

    if (search) {
      whereClause = "WHERE c.nama_cafe LIKE ? OR a.email LIKE ? OR a.username LIKE ?";
      const searchPattern = `%${search}%`;
      params = [searchPattern, searchPattern, searchPattern];
    }

    const countQuery = `SELECT COUNT(DISTINCT c.id) as total FROM cafe c LEFT JOIN admins a ON c.id = a.cafe_id ${whereClause}`;
    const totalResult = await queryAsync(countQuery, params);
    const total = totalResult[0].total;

    const cafesQuery = `
      SELECT 
        c.id,
        c.id AS cafe_id,
        c.nama_cafe,
        c.logo_cafe,
        c.alamat,
        c.tema_colors,
        ${hasColumn(cafeColumns, "status") ? "MAX(c.status) AS status" : "NULL AS status"},
        ${hasColumn(cafeColumns, "created_at") ? "MAX(c.created_at) AS registered_at" : "MIN(a.created_at) AS registered_at"},
        ${hasSubscriptionsTable ? "MAX(cs.plan_id) AS plan_id" : "NULL AS plan_id"},
        ${hasSubscriptionsTable ? "MAX(cs.status) AS subscription_status" : "NULL AS subscription_status"},
        ${hasSubscriptionsTable ? "MAX(cs.active_until) AS subscription_expires" : "NULL AS subscription_expires"},
        ${hasSubscriptionsTable && hasPlansTable ? "MAX(sp.name) AS subscription_plan_name" : "NULL AS subscription_plan_name"},
        ${hasSubscriptionsTable && hasPlansTable ? "MAX(sp.name) AS subscription_plan" : "NULL AS subscription_plan"},
        MAX(a.id) AS admin_id, 
        MAX(a.email) AS admin_email, 
        MAX(a.username) AS admin_username, 
        MIN(a.created_at) AS admin_created_at,
        COUNT(DISTINCT m.id) AS total_menus,
        COUNT(DISTINCT o.id) AS total_orders,
        COALESCE(SUM(CASE WHEN o.status = 'selesai' THEN o.total ELSE 0 END), 0) AS total_revenue
      FROM cafe c
      LEFT JOIN admins a ON c.id = a.cafe_id
      ${hasSubscriptionsTable ? "LEFT JOIN cafe_subscriptions cs ON c.id = cs.cafe_id" : ""}
      ${hasSubscriptionsTable && hasPlansTable ? "LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id" : ""}
      LEFT JOIN menus m ON c.id = m.cafe_id
      LEFT JOIN orders o ON c.id = o.cafe_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.id DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    const cafesRaw = await queryAsync(cafesQuery, params);

    const baseUrlEnv = (process.env.BASE_URL || "").replace(/\/$/, "");
    const hostBase = `${req.protocol}://${req.get("host")}`;
    const baseUrl = baseUrlEnv || hostBase;
    const cafes = (cafesRaw || []).map((row) => {
      const logo = row.logo_cafe || "";
      let logo_url = null;
      if (typeof logo === "string" && logo.length > 0) {
        if (logo.startsWith("data:") || logo.startsWith("http://") || logo.startsWith("https://")) {
          logo_url = logo;
        } else if (logo.startsWith("/asset/")) {
          logo_url = `${baseUrl}${logo}`;
        } else {
          // default stored filename -> serve from /asset
          logo_url = `${baseUrl}/asset/${logo}`;
        }
      }
      return normalizeCafeSubscription({ ...row, logo_url });
    });

    return sendResponse(res, 200, "Berhasil mengambil data cafe", {
      cafes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get cafes error:", error);
    const pub = toPublicError(error, "Gagal mengambil data cafe");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.getCafeDetail = async (req, res) => {
  try {
    const cafeId = req.params.id;
    const cafeColumns = await getTableColumns("cafe");
    const hasSubscriptionsTable = (await getTableColumns("cafe_subscriptions")).size > 0;
    const hasPlansTable = (await getTableColumns("subscription_plans")).size > 0;

    const cafe = await queryAsync(
      `SELECT c.*, 
              c.id AS cafe_id,
              ${hasColumn(cafeColumns, "created_at") ? "c.created_at AS registered_at" : "a.created_at AS registered_at"},
              ${hasSubscriptionsTable ? "cs.plan_id" : "NULL AS plan_id"},
              ${hasSubscriptionsTable ? "cs.status AS subscription_status" : "NULL AS subscription_status"},
              ${hasSubscriptionsTable ? "cs.active_until AS subscription_expires" : "NULL AS subscription_expires"},
              ${hasSubscriptionsTable && hasPlansTable ? "sp.name AS subscription_plan_name" : "NULL AS subscription_plan_name"},
              ${hasSubscriptionsTable && hasPlansTable ? "sp.name AS subscription_plan" : "NULL AS subscription_plan"},
              a.id as admin_id, a.email as admin_email, a.username as admin_username, a.created_at as admin_created_at
       FROM cafe c
       ${hasSubscriptionsTable ? "LEFT JOIN cafe_subscriptions cs ON c.id = cs.cafe_id" : ""}
       ${hasSubscriptionsTable && hasPlansTable ? "LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id" : ""}
       LEFT JOIN admins a ON c.id = a.cafe_id
       WHERE c.id = ?`,
      [cafeId]
    );

    if (!cafe || cafe.length === 0) {
      return sendResponse(res, 404, "Cafe tidak ditemukan", null);
    }

    const menus = await queryAsync(
      "SELECT COUNT(*) as count FROM menus WHERE cafe_id = ?",
      [cafeId]
    );

    const orders = await queryAsync(
      "SELECT COUNT(*) as count FROM orders WHERE cafe_id = ?",
      [cafeId]
    );

    const revenue = await queryAsync(
      "SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE cafe_id = ? AND status = 'selesai'",
      [cafeId]
    );

    const kasirs = await queryAsync(
      "SELECT * FROM kasirs WHERE cafe_id = ?",
      [cafeId]
    );

    const baseUrlEnv2 = (process.env.BASE_URL || "").replace(/\/$/, "");
    const hostBase2 = `${req.protocol}://${req.get("host")}`;
    const baseUrl2 = baseUrlEnv2 || hostBase2;
    const row = cafe[0];
    let logo_url = null;
    const logoVal = row.logo_cafe || "";
    if (typeof logoVal === "string" && logoVal.length > 0) {
      if (logoVal.startsWith("data:") || logoVal.startsWith("http://") || logoVal.startsWith("https://")) {
        logo_url = logoVal;
      } else if (logoVal.startsWith("/asset/")) {
        logo_url = `${baseUrl2}${logoVal}`;
      } else {
        logo_url = `${baseUrl2}/asset/${logoVal}`;
      }
    }

    const normalizedCafe = normalizeCafeSubscription(row);

    return sendResponse(res, 200, "Berhasil mengambil detail cafe", {
      ...normalizedCafe,
      logo_url,
      stats: {
        totalMenus: menus[0].count,
        totalOrders: orders[0].count,
        totalRevenue: parseFloat(revenue[0].total || 0),
        totalKasirs: kasirs.length,
      },
      kasirs,
    });
  } catch (error) {
    console.error("Get cafe detail error:", error);
    const pub = toPublicError(error, "Gagal mengambil detail cafe");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.toggleCafeStatus = async (req, res) => {
  try {
    const cafeId = req.params.id;
    const { status } = req.body;
    const cafeColumns = await getTableColumns("cafe");

    if (!hasColumn(cafeColumns, "status")) {
      return sendResponse(res, 400, "Kolom status cafe belum tersedia di database", null);
    }

    await queryAsync(
      "UPDATE cafe SET status = ? WHERE id = ?",
      [status ? 1 : 0, cafeId]
    );

    await insertActivityLog({
      cafe_id: cafeId,
      action: "TOGGLE_STATUS",
      description: `Status cafe diubah menjadi ${status ? "aktif" : "nonaktif"}`,
    });

    return sendResponse(res, 200, "Status cafe berhasil diubah", { status });
  } catch (error) {
    console.error("Toggle cafe status error:", error);
    const pub = toPublicError(error, "Gagal mengubah status cafe");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.getAllAdmins = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    let whereClause = "";
    let params = [];

    if (search) {
      whereClause = "WHERE a.email LIKE ? OR a.username LIKE ? OR c.nama_cafe LIKE ?";
      const searchPattern = `%${search}%`;
      params = [searchPattern, searchPattern, searchPattern];
    }

    const countQuery = `SELECT COUNT(*) as total FROM admins a ${whereClause}`;
    const totalResult = await queryAsync(countQuery, params);
    const total = totalResult[0].total;

    const adminsQuery = `
      SELECT a.*, c.nama_cafe, c.logo_cafe,
             COUNT(DISTINCT m.id) as total_menus,
             COUNT(DISTINCT o.id) as total_orders
      FROM admins a
      LEFT JOIN cafe c ON a.cafe_id = c.id
      LEFT JOIN menus m ON c.id = m.cafe_id
      LEFT JOIN orders o ON c.id = o.cafe_id
      ${whereClause}
      GROUP BY a.id
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    const admins = await queryAsync(adminsQuery, params);

    const activeAdmins = await queryAsync(
      "SELECT COUNT(*) as count FROM admins WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
      []
    );

    return sendResponse(res, 200, "Berhasil mengambil data admin", {
      admins,
      stats: {
        totalAdmins: total,
        activeAdmins: activeAdmins[0].count,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get admins error:", error);
    const pub = toPublicError(error, "Gagal mengambil data admin");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.getReports = async (req, res) => {
  try {
    // Support both startDate/endDate and start/end
    const startDate = req.query.startDate ?? req.query.start;
    const endDate = req.query.endDate ?? req.query.end;

    const hasRange = Boolean(startDate && endDate);
    const rangeParams = hasRange ? [startDate, endDate] : [];

    // Revenue: always have WHERE with status, optionally add range
    const revenueQuery = `
      SELECT COALESCE(SUM(total), 0) AS total
      FROM orders o
      WHERE o.status = 'selesai' ${hasRange ? 'AND o.created_at BETWEEN ? AND ?' : ''}
    `;
    const revenue = await queryAsync(revenueQuery, rangeParams);

    // Orders count: optionally add WHERE with range
    const ordersQuery = `
      SELECT COUNT(*) AS count
      FROM orders o
      ${hasRange ? 'WHERE o.created_at BETWEEN ? AND ?' : ''}
    `;
    const orders = await queryAsync(ordersQuery, rangeParams);

    // New cafes: if range provided, count admins created in range; otherwise count all cafes
    let newCafes;
    if (hasRange) {
      newCafes = await queryAsync(
        `SELECT COUNT(*) AS count
         FROM cafe c
         WHERE c.id IN (
           SELECT DISTINCT cafe_id FROM admins WHERE created_at BETWEEN ? AND ?
         )`,
        rangeParams,
      );
    } else {
      newCafes = await queryAsync(`SELECT COUNT(*) AS count FROM cafe`, []);
    }

    // Active users (distinct cafes with orders): optionally filter by range
    const activeUsersQuery = `
      SELECT COUNT(DISTINCT cafe_id) AS count
      FROM orders o
      ${hasRange ? 'WHERE o.created_at BETWEEN ? AND ?' : ''}
    `;
    const activeUsers = await queryAsync(activeUsersQuery, rangeParams);

    // Top cafes by revenue (completed orders), optionally constrain join by created_at range
    const topCafesQuery = `
      SELECT c.id, c.nama_cafe, c.logo_cafe,
             COUNT(o.id) AS total_orders,
             COALESCE(SUM(o.total), 0) AS total_revenue
      FROM cafe c
      LEFT JOIN orders o ON c.id = o.cafe_id ${hasRange ? 'AND o.created_at BETWEEN ? AND ?' : ''}
      WHERE o.status = 'selesai'
      GROUP BY c.id
      ORDER BY total_revenue DESC
      LIMIT 10
    `;
    const topCafes = await queryAsync(topCafesQuery, rangeParams);

    // Daily revenue: always filter status, optionally add date range
    const dailyRevenueQuery = `
      SELECT DATE(o.created_at) AS date,
             COUNT(*) AS orders,
             COALESCE(SUM(total), 0) AS revenue
      FROM orders o
      WHERE o.status = 'selesai' ${hasRange ? 'AND o.created_at BETWEEN ? AND ?' : ''}
      GROUP BY DATE(o.created_at)
      ORDER BY date DESC
      LIMIT 30
    `;
    const dailyRevenue = await queryAsync(dailyRevenueQuery, rangeParams);

    return sendResponse(res, 200, "Berhasil mengambil laporan", {
      summary: {
        totalRevenue: parseFloat(revenue[0].total || 0),
        totalOrders: orders[0].count,
        newCafes: newCafes[0].count,
        activeUsers: activeUsers[0].count,
      },
      topCafes,
      dailyRevenue,
    });
  } catch (error) {
    console.error("Get reports error:", error);
    const pub = toPublicError(error, "Gagal mengambil laporan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const cafesByRegion = await queryAsync(
      `SELECT 
        SUBSTRING_INDEX(alamat, ',', -1) as region,
        COUNT(*) as count
       FROM cafe
       WHERE alamat IS NOT NULL AND alamat != ''
       GROUP BY region
       ORDER BY count DESC
       LIMIT 10`,
      []
    );

    const ordersByMethod = await queryAsync(
      `SELECT method, COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
       FROM orders
       WHERE status = 'selesai'
       GROUP BY method`,
      []
    );

    const registrationTrend = await queryAsync(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count
       FROM admins
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12`,
      []
    );

    const menuCategories = await queryAsync(
      `SELECT k.nama_kategori, COUNT(m.id) as count
       FROM kategoris k
       LEFT JOIN menus m ON k.id = m.id_kategori
       GROUP BY k.id
       ORDER BY count DESC
       LIMIT 10`,
      []
    );

    return sendResponse(res, 200, "Berhasil mengambil analytics", {
      cafesByRegion,
      ordersByMethod,
      registrationTrend,
      menuCategories,
    });
  } catch (error) {
    console.error("Get analytics error:", error);
    const pub = toPublicError(error, "Gagal mengambil analytics");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.getSettings = async (req, res) => {
  try {
    const settings = await queryAsync("SELECT * FROM system_settings", []);

    const settingsObj = buildSettingsObject(settings);

    return sendResponse(res, 200, "Berhasil mengambil pengaturan", settingsObj);
  } catch (error) {
    console.error("Get settings error:", error);
    const pub = toPublicError(error, "Gagal mengambil pengaturan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.getPublicSettings = async (req, res) => {
  try {
    const settings = await queryAsync(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (?, ?)",
      ["maintenanceMode", "maintenance_mode"],
    );

    const settingsObj = buildSettingsObject(settings);
    const maintenanceValue =
      settingsObj.maintenanceMode ?? settingsObj.maintenance_mode ?? "0";

    return sendResponse(res, 200, "Berhasil mengambil pengaturan publik", {
      maintenanceMode: toBoolean(maintenanceValue),
      maintenance_mode: toBoolean(maintenanceValue),
    });
  } catch (error) {
    console.error("Get public settings error:", error);
    const pub = toPublicError(error, "Gagal mengambil pengaturan publik");
    return sendResponse(res, pub.status, pub.message, {
      maintenanceMode: false,
      maintenance_mode: false,
    });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const settings = req.body;

    for (const [key, value] of Object.entries(settings)) {
      await queryAsync(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, String(value)]
      );
    }

    await insertActivityLog({
      user_id: req.superAdmin?.id,
      admin_id: req.superAdmin?.id,
      action: "UPDATE_SETTINGS",
      activity: "Pengaturan sistem diperbarui",
      description: "Pengaturan sistem diperbarui",
      ip_address: req.ip,
    });

    return sendResponse(res, 200, "Pengaturan berhasil diperbarui", settings);
  } catch (error) {
    console.error("Update settings error:", error);
    const pub = toPublicError(error, "Gagal memperbarui pengaturan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};
