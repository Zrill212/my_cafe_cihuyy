const crypto = require("crypto");

const parseCookies = (cookieHeader) => {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== "string") return out;

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(val);
  }

  return out;
};

const buildCookie = (name, value, options = {}) => {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAgeSeconds) segments.push(`Max-Age=${options.maxAgeSeconds}`);
  if (options.path) segments.push(`Path=${options.path}`);
  if (options.httpOnly) segments.push("HttpOnly");
  if (options.secure) segments.push("Secure");
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);

  return segments.join("; ");
};

module.exports = (req, res, next) => {
  const fingerprintRaw =
    req.headers["x-fingerprint"] ||
    req.body?.fingerprint ||
    req.query?.fingerprint ||
    null;
  const fingerprint = fingerprintRaw ? String(fingerprintRaw) : null;

  const cookies = parseCookies(req.headers.cookie);
  let visitorId = cookies.visitor_id;

  if (!visitorId && fingerprint) {
    visitorId = crypto.createHash("sha256").update(fingerprint).digest("hex");
    const cookie = buildCookie("visitor_id", visitorId, {
      path: "/",
      sameSite: "Lax",
      httpOnly: false,
      maxAgeSeconds: 60 * 60 * 24 * 365,
      secure: false,
    });
    res.setHeader("Set-Cookie", cookie);
  }

  req.clientMeta = {
    visitor_id: visitorId || null,
    fingerprint,
  };

  next();
};
