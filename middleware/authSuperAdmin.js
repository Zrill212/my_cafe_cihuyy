const jwt = require("jsonwebtoken");

const authSuperAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        status: 401,
        message: "Token tidak ditemukan",
      });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({
          status: 401,
          message: "Token tidak valid atau sudah kadaluarsa",
        });
      }

      if (decoded.role !== "superadmin") {
        return res.status(403).json({
          status: 403,
          message: "Akses ditolak. Hanya Super Admin yang diizinkan",
        });
      }

      req.superAdmin = {
        id: decoded.id,
        email: decoded.email,
        username: decoded.username,
        role: decoded.role,
      };

      next();
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Terjadi kesalahan pada server",
    });
  }
};

module.exports = authSuperAdmin;
