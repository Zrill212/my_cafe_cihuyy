require("dotenv").config();
const mysql = require("mysql2/promise");

const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "cafe-1",
  multipleStatements: true,
};

// ─── MIGRATIONS ─────────────────────────────────────────
const MIGRATIONS = [
  {
    name: "cafe",
    sql: `
      CREATE TABLE IF NOT EXISTS cafe (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nama_cafe VARCHAR(100) NOT NULL,
        logo_cafe LONGTEXT,
        alamat TEXT,
        tema_colors TEXT
      );
    `,
  },
  {
    name: "admins",
    sql: `
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    name: "kasirs",
    sql: `
      CREATE TABLE IF NOT EXISTS kasirs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    name: "kategoris",
    sql: `
      CREATE TABLE IF NOT EXISTS kategoris (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT,
        nama_kategori VARCHAR(100),
        logo VARCHAR(255)
      );
    `,
  },
  {
    name: "menus",
    sql: `
      CREATE TABLE IF NOT EXISTS menus (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        id_kategori INT NOT NULL,
        nama_menu VARCHAR(100) NOT NULL,
        image_url VARCHAR(255) DEFAULT '',
        deskripsi VARCHAR(255) DEFAULT '',
        harga INT DEFAULT 0,
        status TINYINT(1) DEFAULT 0
      );
    `,
  },
  {
    name: "pembayaran",
    sql: `
      CREATE TABLE IF NOT EXISTS pembayaran (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        nama_method VARCHAR(255) NOT NULL,
        status_method TINYINT(1) DEFAULT 0
      );
    `,
  },
  {
    name: "promo",
    sql: `
      CREATE TABLE IF NOT EXISTS promo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        nama_promo VARCHAR(100),
        kode_promo VARCHAR(255),
        tipe_diskon TINYINT(1) DEFAULT 0,
        nilai INT DEFAULT 0,
        minimum_order INT DEFAULT 0,
        mulai_date DATE,
        berakhir_date DATE
      );
    `,
  },
  {
    name: "qris",
    sql: `
      CREATE TABLE IF NOT EXISTS qris (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        nama_merchant VARCHAR(255),
        nomor_merchant INT,
        qris_image TEXT,
        biaya_type VARCHAR(50),
        biaya_transaksi_qris VARCHAR(100)
      );
    `,
  },
  {
    name: "bank_transfer",
    sql: `
      CREATE TABLE IF NOT EXISTS bank_transfer (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        nama_bank VARCHAR(50),
        nomor_bank BIGINT,
        nama_pemilik VARCHAR(100)
      );
    `,
  },
  {
    name: "ewalet",
    sql: `
      CREATE TABLE IF NOT EXISTS ewalet (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        nama_wallet VARCHAR(100),
        nomor_wallet VARCHAR(50),
        nama_pemilik VARCHAR(100)
      );
    `,
  },
  {
    name: "table_cafe",
    sql: `
      CREATE TABLE IF NOT EXISTS table_cafe (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        nomor_meja INT,
        status TINYINT(1) DEFAULT 0,
        qr_code TEXT
      );
    `,
  },
  {
    name: "pajaks",
    sql: `
      CREATE TABLE IF NOT EXISTS pajaks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        pajak INT DEFAULT 0
      );
    `,
  },
  {
    name: "variats",
    sql: `
      CREATE TABLE IF NOT EXISTS variats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        id_menu INT NOT NULL,
        label VARCHAR(100),
        harga_variant DECIMAL(12,2),
        nama_group VARCHAR(100)
      );
    `,
  },
  {
    name: "orders",
    sql: `
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(30) PRIMARY KEY,
        cafe_id INT NOT NULL,
        meja INT,
        nama VARCHAR(100),
        status ENUM('proses','selesai') DEFAULT 'proses',
        total DECIMAL(12,2) DEFAULT 0,
        note TEXT,
        method ENUM('online','kasir') DEFAULT 'online',
        estimasi VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    name: "order_items",
    sql: `
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(30),
        nama_menu VARCHAR(150),
        qty INT DEFAULT 1,
        harga DECIMAL(12,2) DEFAULT 0,
        catatan TEXT
      );
    `,
  },
  {
    name: "riwayat_pembelian",
    sql: `
      CREATE TABLE IF NOT EXISTS riwayat_pembelian (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(30),
        cafe_id INT,
        visitor_id VARCHAR(255),
        fingerprint VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      SET @db_name = DATABASE();
      SET @has_uq_riwayat_order_id = (
        SELECT COUNT(1)
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = @db_name
          AND TABLE_NAME = 'riwayat_pembelian'
          AND INDEX_NAME = 'uq_riwayat_order_id'
      );
      SET @sql = IF(
        @has_uq_riwayat_order_id = 0,
        'CREATE UNIQUE INDEX uq_riwayat_order_id ON riwayat_pembelian (order_id)',
        'SELECT 1'
      );
      PREPARE stmt FROM @sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    `,
  },
  {
    name: "order_payments",
    sql: `
      CREATE TABLE IF NOT EXISTS order_payments (
        order_id VARCHAR(30) PRIMARY KEY,
        cafe_id INT NULL,
        provider VARCHAR(30) NOT NULL DEFAULT 'midtrans',
        status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
        transaction_status VARCHAR(50) NULL,
        payment_type VARCHAR(50) NULL,
        fraud_status VARCHAR(50) NULL,
        midtrans_transaction_id VARCHAR(100) NULL,
        raw_json LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      SET @db_name = DATABASE();
      SET @has_idx_order_payments_cafe = (
        SELECT COUNT(1)
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = @db_name
          AND TABLE_NAME = 'order_payments'
          AND INDEX_NAME = 'idx_order_payments_cafe'
      );
      SET @sql = IF(
        @has_idx_order_payments_cafe = 0,
        'CREATE INDEX idx_order_payments_cafe ON order_payments (cafe_id)',
        'SELECT 1'
      );
      PREPARE stmt FROM @sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;

      SET @has_idx_order_payments_status = (
        SELECT COUNT(1)
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = @db_name
          AND TABLE_NAME = 'order_payments'
          AND INDEX_NAME = 'idx_order_payments_status'
      );
      SET @sql = IF(
        @has_idx_order_payments_status = 0,
        'CREATE INDEX idx_order_payments_status ON order_payments (status)',
        'SELECT 1'
      );
      PREPARE stmt FROM @sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    `,
  },
  {
    name: "cafe_saldo_transactions",
    sql: `
      CREATE TABLE IF NOT EXISTS cafe_saldo_transactions (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        cafe_id INT NOT NULL,
        order_id VARCHAR(30) NOT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        payment_method VARCHAR(30) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_cafe_saldo_order_id (order_id),
        INDEX idx_cafe_saldo_cafe_id (cafe_id),
        INDEX idx_cafe_saldo_created_at (created_at)
      );
    `,
  },
  {
    name: "cafe_withdrawal_requests",
    sql: `
      CREATE TABLE IF NOT EXISTS cafe_withdrawal_requests (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        client_ref VARCHAR(80) NULL,
        cafe_id INT NOT NULL,
        admin_id INT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        method VARCHAR(40) NOT NULL DEFAULT 'transfer_bank',
        bank_name VARCHAR(100) NULL,
        account_number VARCHAR(64) NULL,
        account_holder VARCHAR(100) NULL,
        status ENUM('pending','processing','completed','rejected') NOT NULL DEFAULT 'processing',
        fingerprint VARCHAR(255) NULL,
        note TEXT NULL,
        superadmin_note TEXT NULL,
        processed_by_superadmin_id INT NULL,
        processed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_cafe_withdrawal_client_ref (cafe_id, client_ref),
        INDEX idx_cafe_withdrawal_cafe (cafe_id),
        INDEX idx_cafe_withdrawal_status (status),
        INDEX idx_cafe_withdrawal_created (created_at)
      );
    `,
  },
  {
    name: "super_admins",
    sql: `
      CREATE TABLE IF NOT EXISTS super_admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50),
        email VARCHAR(255),
        password VARCHAR(255),
        full_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    name: "system_settings",
    sql: `
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        description VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `,
  },
  {
    name: "activity_logs",
    sql: `
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        activity TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    name: "subscription_plans",
    sql: `
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        price INT NOT NULL,
        duration_days INT NOT NULL,
        duration_minutes INT NOT NULL DEFAULT 0,
        duration_unit ENUM('minute','day','month','year') NOT NULL DEFAULT 'day',
        duration_value INT NOT NULL DEFAULT 30,
        features_json TEXT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      SET @db_name = DATABASE();

      SET @has_duration_minutes = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = @db_name
          AND TABLE_NAME = 'subscription_plans'
          AND COLUMN_NAME = 'duration_minutes'
      );
      SET @sql = IF(
        @has_duration_minutes = 0,
        'ALTER TABLE subscription_plans ADD COLUMN duration_minutes INT NOT NULL DEFAULT 0 AFTER duration_days',
        'SELECT 1'
      );
      PREPARE stmt FROM @sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;

      SET @has_duration_unit = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = @db_name
          AND TABLE_NAME = 'subscription_plans'
          AND COLUMN_NAME = 'duration_unit'
      );
      SET @sql = IF(
        @has_duration_unit = 0,
        "ALTER TABLE subscription_plans ADD COLUMN duration_unit ENUM('minute','day','month','year') NOT NULL DEFAULT 'day' AFTER duration_minutes",
        'SELECT 1'
      );
      PREPARE stmt FROM @sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;

      SET @has_duration_value = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = @db_name
          AND TABLE_NAME = 'subscription_plans'
          AND COLUMN_NAME = 'duration_value'
      );
      SET @sql = IF(
        @has_duration_value = 0,
        'ALTER TABLE subscription_plans ADD COLUMN duration_value INT NOT NULL DEFAULT 30 AFTER duration_unit',
        'SELECT 1'
      );
      PREPARE stmt FROM @sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;

      UPDATE subscription_plans
      SET duration_unit = 'minute',
          duration_value = GREATEST(COALESCE(duration_minutes, 0), 1)
      WHERE COALESCE(duration_minutes, 0) > 0
        AND (duration_unit IS NULL OR duration_unit = '' OR duration_unit = 'day')
        AND COALESCE(duration_value, 0) <= 0;

      UPDATE subscription_plans
      SET duration_unit = 'day',
          duration_value = GREATEST(COALESCE(duration_days, 0), 1)
      WHERE COALESCE(duration_minutes, 0) <= 0
        AND COALESCE(duration_days, 0) > 0
        AND (duration_unit IS NULL OR duration_unit = '' OR COALESCE(duration_value, 0) <= 0);

      INSERT INTO subscription_plans (name, price, duration_days, duration_minutes, duration_unit, duration_value, features_json, is_active, sort_order)
      SELECT * FROM (
        SELECT 'Free' AS name, 0 AS price, 30 AS duration_days, 0 AS duration_minutes, 'day' AS duration_unit, 30 AS duration_value, JSON_OBJECT('menu', true, 'orders', true, 'reports', false) AS features_json, 1 AS is_active, 0 AS sort_order
      ) AS tmp
      WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Free');
    `,
  },
  {
    name: "cafe_subscriptions",
    sql: `
      CREATE TABLE IF NOT EXISTS cafe_subscriptions (
        cafe_id INT PRIMARY KEY,
        plan_id INT NULL,
        status ENUM('inactive','active','expired') NOT NULL DEFAULT 'inactive',
        started_at DATETIME NULL,
        active_until DATETIME NULL,
        last_transaction_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_cafe_subscriptions_cafe FOREIGN KEY (cafe_id) REFERENCES cafe(id) ON DELETE CASCADE,
        CONSTRAINT fk_cafe_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL
      );
    `,
  },
  {
    name: "subscription_transactions",
    sql: `
      CREATE TABLE IF NOT EXISTS subscription_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        order_id VARCHAR(80) NOT NULL UNIQUE,
        cafe_id INT NOT NULL,
        admin_id INT NULL,
        plan_id INT NOT NULL,
        expected_amount INT NOT NULL,
        snap_token VARCHAR(255) NULL,
        redirect_url TEXT NULL,
        status ENUM('pending','paid','failed','expired','canceled') NOT NULL DEFAULT 'pending',
        midtrans_transaction_id VARCHAR(100) NULL,
        payment_type VARCHAR(50) NULL,
        transaction_status VARCHAR(50) NULL,
        fraud_status VARCHAR(50) NULL,
        transaction_time DATETIME NULL,
        settlement_time DATETIME NULL,
        raw_notification_json TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_sub_tx_cafe FOREIGN KEY (cafe_id) REFERENCES cafe(id) ON DELETE CASCADE,
        CONSTRAINT fk_sub_tx_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        INDEX idx_sub_tx_cafe_id (cafe_id),
        INDEX idx_sub_tx_status (status)
      );
    `,
  },
];

// ─── DROP ORDER ─────────────────────────────────────────
const DROP_ORDER = [
  "subscription_transactions",
  "cafe_subscriptions",
  "subscription_plans",
  "cafe_withdrawal_requests",
  "cafe_saldo_transactions",
  "order_payments",
  "riwayat_pembelian",
  "order_items",
  "orders",
  "variats",
  "pajaks",
  "table_cafe",
  "system_settings",
  "activity_logs",
  "ewalet",
  "bank_transfer",
  "qris",
  "promo",
  "pembayaran",
  "menus",
  "kategoris",
  "kasirs",
  "admins",
  "super_admins",
  "cafe",
];

// ─── CONNECT ────────────────────────────────────────────
async function connect() {
  try {
    const conn = await mysql.createConnection(DB_CONFIG);
    console.log("✔ Connected to DB\n");
    return conn;
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    process.exit(1);
  }
}

// ─── RUN MIGRATION ─────────────────────────────────────
async function runMigrations(conn) {
  for (const m of MIGRATIONS) {
    try {
      await conn.query(m.sql);
      console.log("✅", m.name);
    } catch (err) {
      console.log("❌", m.name, err.message);
    }
  }
}

// ─── ROLLBACK ──────────────────────────────────────────
async function rollback(conn) {
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const tbl of DROP_ORDER) {
    await conn.query(`DROP TABLE IF EXISTS ${tbl}`);
    console.log("🗑️ Drop", tbl);
  }
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

// ─── MAIN ──────────────────────────────────────────────
(async () => {
  const conn = await connect();
  const isRollback = process.argv.includes("--rollback");

  if (isRollback) {
    await rollback(conn);
  }

  await runMigrations(conn);
  await conn.end();

  console.log("\n🎉 Migration selesai!");
})();