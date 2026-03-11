const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "Token tidak ada!" });
  }

  jwt.verify(token, "SECRET_CAFE_KEY", (err, user) => {
    if (err) return res.status(401).json({ message: "Token tidak valid!" });

    // user harus mengandung cafe_id
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      cafe_id: user.cafe_id // ini sangat penting
    };

    next();
  });
};

module.exports = verifyToken;