-- Migration: orders & order_items
-- Jalankan: mysql -u root -p nama_database < migration_orders.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id         VARCHAR(30)                 PRIMARY KEY,
  cafe_id    INT                         NOT NULL,
  meja       INT                         NOT NULL,
  nama       VARCHAR(100)                DEFAULT '',
  status     ENUM('proses','selesai')    DEFAULT 'proses',
  total      DECIMAL(12,2)               DEFAULT 0,
  note       TEXT,
  method     ENUM('online','kasir')      DEFAULT 'online',
  estimasi   VARCHAR(20)                 DEFAULT '15 mnt',
  created_at TIMESTAMP                   DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_cafe_id (cafe_id),
  INDEX idx_meja    (meja),
  INDEX idx_status  (status),
  INDEX idx_created (created_at)
);

CREATE TABLE IF NOT EXISTS order_items (
  id        INT           PRIMARY KEY AUTO_INCREMENT,
  order_id  VARCHAR(30)   NOT NULL,
  nama_menu VARCHAR(150)  NOT NULL,
  qty       INT           DEFAULT 1,
  harga     DECIMAL(12,2) DEFAULT 0,
  catatan   TEXT,

  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_order_id (order_id)
);