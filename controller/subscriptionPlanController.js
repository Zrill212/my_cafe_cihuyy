const db = require("../config/db");
const { toPublicError } = require("../utils/publicError");

const sendResponse = (res, httpStatus, message, data) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
  });
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

const ALLOWED_DURATION_UNITS = new Set(["minute", "day", "month", "year"]);

const normalizePlanDuration = (payload = {}) => {
  const rawUnit = String(payload.duration_unit || "").trim().toLowerCase();
  const rawValue = payload.duration_value;
  const rawMinutes = payload.duration_minutes;
  const rawDays = payload.duration_days;

  let durationUnit = rawUnit;
  let durationValue = Number(rawValue);

  if (!ALLOWED_DURATION_UNITS.has(durationUnit) || !Number.isFinite(durationValue) || durationValue <= 0) {
    if (Number.isFinite(Number(rawMinutes)) && Number(rawMinutes) > 0) {
      durationUnit = "minute";
      durationValue = Number(rawMinutes);
    } else if (Number.isFinite(Number(rawDays)) && Number(rawDays) > 0) {
      durationUnit = "day";
      durationValue = Number(rawDays);
    }
  }

  if (!ALLOWED_DURATION_UNITS.has(durationUnit) || !Number.isFinite(durationValue) || durationValue <= 0) {
    return {
      error: "duration wajib valid. Gunakan duration_unit: minute/day/month/year dan duration_value > 0",
    };
  }

  const durationMinutes = durationUnit === "minute" ? durationValue : 0;
  const durationDays = durationUnit === "day" ? durationValue : 0;

  return {
    duration_unit: durationUnit,
    duration_value: Math.trunc(durationValue),
    duration_minutes: Math.trunc(durationMinutes),
    duration_days: Math.trunc(durationDays),
  };
};

exports.listPlans = async (req, res) => {
  try {
    const plans = await queryAsync(
      "SELECT * FROM subscription_plans ORDER BY sort_order ASC, id ASC",
      [],
    );
    return sendResponse(res, 200, "Berhasil mengambil paket langganan", plans || []);
  } catch (err) {
    console.error("[SUBSCRIPTION_PLAN][LIST] error:", {
      code: err?.code,
      message: err?.message,
      sqlMessage: err?.sqlMessage,
    });
    if (err?.code === "ER_NO_SUCH_TABLE") {
      return sendResponse(
        res,
        500,
        "Tabel subscription_plans belum ada. Jalankan migration create_subscriptions.sql dulu",
        [],
      );
    }
    const pub = toPublicError(err, "Gagal mengambil paket langganan");
    return sendResponse(res, pub.status, pub.message, []);
  }
};

exports.createPlan = async (req, res) => {
  try {
    const { name, price, features_json, is_active, sort_order } = req.body;
    const planColumns = await getTableColumns("subscription_plans");

    if (!name) return sendResponse(res, 400, "name wajib diisi", null);
    if (price === undefined || price === null || !Number.isFinite(Number(price)) || Number(price) < 0) {
      return sendResponse(res, 400, "price wajib angka >= 0", null);
    }

    const duration = normalizePlanDuration(req.body);
    if (duration.error) return sendResponse(res, 400, duration.error, null);

    const active = is_active === undefined ? 1 : is_active ? 1 : 0;
    const sort = sort_order === undefined ? 0 : Number(sort_order) || 0;

    const payload = features_json === undefined || features_json === null
      ? null
      : typeof features_json === "string"
        ? features_json
        : JSON.stringify(features_json);

    const insertColumns = ["name", "price", "duration_days"];
    const insertValues = [name, Number(price), duration.duration_days];

    if (hasColumn(planColumns, "duration_minutes")) {
      insertColumns.push("duration_minutes");
      insertValues.push(duration.duration_minutes);
    }
    if (hasColumn(planColumns, "duration_unit")) {
      insertColumns.push("duration_unit");
      insertValues.push(duration.duration_unit);
    }
    if (hasColumn(planColumns, "duration_value")) {
      insertColumns.push("duration_value");
      insertValues.push(duration.duration_value);
    }

    insertColumns.push("features_json", "is_active", "sort_order");
    insertValues.push(payload, active, sort);

    const placeholders = insertColumns.map(() => "?").join(", ");

    const result = await queryAsync(
      `INSERT INTO subscription_plans (${insertColumns.join(", ")}) VALUES (${placeholders})`,
      insertValues,
    );

    return sendResponse(res, 201, "Paket langganan berhasil dibuat", { id: result.insertId });
  } catch (err) {
    console.error("[SUBSCRIPTION_PLAN][CREATE] error:", {
      code: err?.code,
      message: err?.message,
      sqlMessage: err?.sqlMessage,
    });
    const pub = toPublicError(err, "Gagal membuat paket langganan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const planColumns = await getTableColumns("subscription_plans");
    if (!Number.isFinite(id) || id <= 0) return sendResponse(res, 400, "id tidak valid", null);

    const { name, price, features_json, is_active, sort_order } = req.body;

    const fields = [];
    const params = [];

    if (name !== undefined) {
      fields.push("name = ?");
      params.push(name);
    }
    if (price !== undefined) {
      const v = Number(price);
      if (!Number.isFinite(v) || v < 0) return sendResponse(res, 400, "price wajib angka >= 0", null);
      fields.push("price = ?");
      params.push(v);
    }

    const hasDurationUpdate = ["duration_days", "duration_minutes", "duration_unit", "duration_value"].some(
      (key) => req.body[key] !== undefined,
    );

    if (hasDurationUpdate) {
      const duration = normalizePlanDuration(req.body);
      if (duration.error) return sendResponse(res, 400, duration.error, null);
      fields.push("duration_days = ?");
      params.push(duration.duration_days);
      if (hasColumn(planColumns, "duration_minutes")) {
        fields.push("duration_minutes = ?");
        params.push(duration.duration_minutes);
      }
      if (hasColumn(planColumns, "duration_unit")) {
        fields.push("duration_unit = ?");
        params.push(duration.duration_unit);
      }
      if (hasColumn(planColumns, "duration_value")) {
        fields.push("duration_value = ?");
        params.push(duration.duration_value);
      }
    }
    if (features_json !== undefined) {
      const payload = features_json === null
        ? null
        : typeof features_json === "string"
          ? features_json
          : JSON.stringify(features_json);
      fields.push("features_json = ?");
      params.push(payload);
    }
    if (is_active !== undefined) {
      fields.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }
    if (sort_order !== undefined) {
      fields.push("sort_order = ?");
      params.push(Number(sort_order) || 0);
    }

    if (fields.length === 0) return sendResponse(res, 400, "Tidak ada field untuk diupdate", null);

    params.push(id);
    const result = await queryAsync(
      `UPDATE subscription_plans SET ${fields.join(", ")} WHERE id = ?`,
      params,
    );

    if (!result || result.affectedRows === 0) return sendResponse(res, 404, "Paket tidak ditemukan", null);

    return sendResponse(res, 200, "Paket langganan berhasil diupdate", { id });
  } catch (err) {
    console.error("[SUBSCRIPTION_PLAN][UPDATE] error:", {
      code: err?.code,
      message: err?.message,
      sqlMessage: err?.sqlMessage,
    });
    const pub = toPublicError(err, "Gagal update paket langganan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};

exports.deletePlan = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return sendResponse(res, 400, "id tidak valid", null);

    // Jika paket sudah dipakai, jangan hard delete (bisa kena foreign key).
    let usage = { cafe_subscriptions: 0, subscription_transactions: 0 };
    try {
      const rows1 = await queryAsync(
        "SELECT COUNT(1) AS cnt FROM cafe_subscriptions WHERE plan_id = ?",
        [id],
      );
      usage.cafe_subscriptions = Number(rows1?.[0]?.cnt || 0);
    } catch (_) {
      usage.cafe_subscriptions = 0;
    }
    try {
      const rows2 = await queryAsync(
        "SELECT COUNT(1) AS cnt FROM subscription_transactions WHERE plan_id = ?",
        [id],
      );
      usage.subscription_transactions = Number(rows2?.[0]?.cnt || 0);
    } catch (_) {
      usage.subscription_transactions = 0;
    }

    const isUsed = usage.cafe_subscriptions > 0 || usage.subscription_transactions > 0;
    if (isUsed) {
      const result = await queryAsync(
        "UPDATE subscription_plans SET is_active = 0 WHERE id = ?",
        [id],
      );
      if (!result || result.affectedRows === 0) {
        return sendResponse(res, 404, "Paket tidak ditemukan", null);
      }
      return sendResponse(res, 200, "Paket sedang dipakai, jadi dinonaktifkan (tidak dihapus)", {
        id,
        action: "deactivated",
        usage,
      });
    }

    const result = await queryAsync("DELETE FROM subscription_plans WHERE id = ?", [id]);
    if (!result || result.affectedRows === 0) return sendResponse(res, 404, "Paket tidak ditemukan", null);

    return sendResponse(res, 200, "Paket langganan berhasil dihapus", { id, action: "deleted" });
  } catch (err) {
    console.error("[SUBSCRIPTION_PLAN][DELETE] error:", {
      code: err?.code,
      message: err?.message,
      sqlMessage: err?.sqlMessage,
    });
    const pub = toPublicError(err, "Gagal hapus paket langganan");
    return sendResponse(res, pub.status, pub.message, null);
  }
};
