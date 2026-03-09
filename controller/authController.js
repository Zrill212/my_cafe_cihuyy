const db = require("../config/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const util = require("util");

const query = util.promisify(db.query).bind(db);

const sendResponse = (res, httpStatus, message, data, admin = {}) => {
  return res.status(httpStatus).json({
    status: httpStatus,
    message,
    data,
    admin,
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return sendResponse(res, 400, "Email dan password wajib diisi", [], {});
  }

  try {
    const adminRows = await query("SELECT * FROM admins WHERE email = ?", [email]);

    if (adminRows && adminRows.length > 0) {
      const admin = adminRows[0];

      const passwordOk = bcrypt.compareSync(password, admin.password);
      if (!passwordOk) {
        return sendResponse(res, 401, "Password salah", [], {});
      }

      const token = jwt.sign(
        { id: admin.id, role: "admin", cafe_id: admin.cafe_id },
        "SECRET_CAFE_KEY",
        { expiresIn: "8h" },
      );

      const { password: _pw, ...adminSafe } = admin;
      return sendResponse(res, 200, "Login berhasil", { token }, adminSafe);
    }

    const kasirRows = await query("SELECT * FROM kasirs WHERE email = ?", [email]);
    if (!kasirRows || kasirRows.length === 0) {
      return sendResponse(res, 404, "User tidak ditemukan", [], {});
    }

    const kasir = kasirRows[0];

    const passwordOk = bcrypt.compareSync(password, kasir.password);
    if (!passwordOk) {
      return sendResponse(res, 401, "Password salah", [], {});
    }

    const token = jwt.sign(
      { id: kasir.id, role: "kasir", cafe_id: kasir.cafe_id },
      "SECRET_CAFE_KEY",
      { expiresIn: "8h" },
    );

    const { password: _pw, ...kasirSafe } = kasir;
    return sendResponse(res, 200, "Login berhasil", { token }, kasirSafe);
  } catch (err) {
    return sendResponse(
      res,
      500,
      err?.sqlMessage || err?.message || "Gagal login",
      [],
      {},
    );
  }
};

exports.register = async (req, res) => {
  const { cafe_id, nama_cafe, username, email, password } = req.body;

  if (!username || !email || !password || (!cafe_id && !nama_cafe)) {
    return sendResponse(res, 400, "Data Yang Dikirim Belum Lengkap Nih", [], {});
  }

  try {
    let resolvedCafeId = cafe_id;

    if (resolvedCafeId) {
      const cafeRows = await query("SELECT id FROM cafe WHERE id = ?", [
        resolvedCafeId,
      ]);
      if (!cafeRows || cafeRows.length === 0) {
        return sendResponse(res, 404, "cafe_id tidak ditemukan", [], {});
      }
    } else {
      const result = await query("INSERT INTO cafe (nama_cafe) VALUES (?)", [
        nama_cafe,
      ]);
      resolvedCafeId = result.insertId;
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    await query(
      "INSERT INTO admins (cafe_id, username, email, password) VALUES (?, ?, ?, ?)",
      [resolvedCafeId, username, email, passwordHash],
    );

    return sendResponse(
      res,
      201,
      "Berhasil Melakukan Register",
      { cafe_id: resolvedCafeId },
      {},
    );
  } catch (err) {
    return sendResponse(
      res,
      500,
      err?.sqlMessage || err?.message || "Gagal register",
      [],
      {},
    );
  }
};
