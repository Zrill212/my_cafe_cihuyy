const jwt = require("jsonwebtoken");
const checkSubscription = require("./checkSubscription");

// Middleware verify token dengan debug cafe_id
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "Token tidak ada!" });
  }

  jwt.verify(token, "SECRET_CAFE_KEY", (err, user) => {
    if (err) {
      return res.status(401).json({ message: "Token tidak valid!" });
    }

    // Pastikan token berisi id, role, dan cafe_id
    if (!user.id || !user.role || !user.cafe_id) {
      return res.status(401).json({ message: "Token tidak lengkap! cafe_id hilang." });
    }

    // Tambahkan debug log sementara
    console.log("Token diterima:", {
      id: user.id,
      role: user.role,
      cafe_id: user.cafe_id,
    });

    // Assign ke req.user
    req.user = {
      id: user.id,
      role: user.role,
      cafe_id: user.cafe_id,
    };

    // Global enforcement subscription (Option A)
    // Allow subscription endpoints so admin can still pay / view billing.
    if (req.method === "OPTIONS") return next();
    if (req.path && req.path.startsWith("/asset")) return next();

    const url = String(req.originalUrl || "");
    if (url.startsWith("/api/subscriptions")) return next();
    if (url.startsWith("/api/withdrawals")) return next();

    return checkSubscription(req, res, next);
  });
};

module.exports = verifyToken;