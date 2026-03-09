require("dotenv").config();
const express = require('express');
const cors = require('cors');
const path = require("path");
const authRoutes = require("./routes/auth");
const app = express();

const PORT = 3000;


app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/asset", express.static(path.join(__dirname, "asset")));
app.use("/uploads", express.static("uploads"));
app.use(express.static("asset"));


app.use((req, res, next) => {
  if (req.path && req.path.startsWith("/asset")) return next();

  const redactAndTruncate = (value) => {
    const seen = new WeakSet();
    const replacer = (key, val) => {
      if (key === "password") return "[REDACTED]";
      if (key === "token") return "[REDACTED]";

      if (typeof val === "string") {
        if (key === "image_base64" || key === "imageBase64") {
          return `[BASE64 ${val.length} chars]`;
        }
        if (val.length > 500) return `${val.slice(0, 500)}...[TRUNCATED ${val.length} chars]`;
      }

      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }

      return val;
    };

    try {
      return JSON.stringify(value, replacer);
    } catch (e) {
      return "[Unserializable Payload]";
    }
  };

  console.log(
    `[REQ] ${req.method} ${req.originalUrl} params=${redactAndTruncate(req.params)} query=${redactAndTruncate(req.query)} body=${redactAndTruncate(req.body)}`,
  );

  next();
});

app.use((req, res, next) => {
  if (req.path && req.path.startsWith("/asset")) return next();

  const start = Date.now();
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  const redact = (value) => {
    const seen = new WeakSet();
    const replacer = (key, val) => {
      if (key === "password") return "[REDACTED]";
      if (key === "token") return "[REDACTED]";
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      return val;
    };

    try {
      return JSON.stringify(value, replacer);
    } catch (e) {
      return "[Unserializable Response]";
    }
  };

  res.json = (body) => {
    if (res.headersSent) return;
    const ms = Date.now() - start;
    console.log(
      `[RES] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms body=${redact(body)}`,
    );

    // Prevent res.json -> res.send from going through our wrapped res.send
    const currentSend = res.send;
    res.send = originalSend;
    try {
      return originalJson(body);
    } finally {
      res.send = currentSend;
    }
  };

  res.send = (body) => {
    if (res.headersSent) return;
    const ms = Date.now() - start;
    const printable =
      typeof body === "string" ? body : body && body.toString ? body.toString() : body;
    console.log(
      `[RES] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms body=${redact(printable)}`,
    );
    return originalSend(body);
  };

  next();
});
app.use("/api/auth", authRoutes);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

const menuRoutes = require('./routes/menuRoutes');
app.use('/api/menu', menuRoutes);

const kategoriRoutes = require('./routes/kategoriRoutes');
app.use('/api/kategori', kategoriRoutes);

const variantRoutes = require('./routes/variantRoutes');
app.use('/api/variant', variantRoutes);

const tableRoutes = require('./routes/tableRoutes');
app.use('/api/tables', tableRoutes);

const promoRoutes = require('./routes/promoRoutes');
app.use('/api/promo', promoRoutes);

const pembayaranRoutes = require('./routes/pembayaranRoutes');
app.use('/api/pembayaran', pembayaranRoutes);

const qrisRoutes = require('./routes/qrisRoutes');
app.use('/api/qris', qrisRoutes);

const bankTransferRoutes = require('./routes/bankTransferRoutes');
app.use('/api/bank-transfer', bankTransferRoutes);

const ewaletRoutes = require('./routes/ewaletRoutes');
app.use('/api/ewalet', ewaletRoutes);
  
const pengaturanRoutes = require('./routes/pengaturanRoutes');
app.use('/api/pengaturan', pengaturanRoutes);

const ordersRoutes = require('./routes/ordersRoutes');
app.use('/api/orders', ordersRoutes);

const midtransRoutes = require('./routes/midtransRoutes');
app.use('/api/midtrans', midtransRoutes);

const laporanRoutes = require('./routes/laporanRoutes');
app.use('/api/laporan', laporanRoutes);

const kasirRoutes = require('./routes/kasirRoutes');
app.use('/api/kasir', kasirRoutes);



app.listen(PORT,'0.0.0.0', () => {
  console.log(`Cafe API running di http://0.0.0.0:${PORT}`);
});
console.log("server key:", process.env.MIDTRANS_SERVER_KEY);