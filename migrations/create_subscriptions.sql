-- Subscription plans managed by Super Admin
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Current subscription state per cafe
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Subscription payment transactions via Midtrans
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
  CONSTRAINT fk_sub_tx_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE INDEX idx_sub_tx_cafe_id ON subscription_transactions (cafe_id);
CREATE INDEX idx_sub_tx_status ON subscription_transactions (status);

-- Seed default plans (safe upsert-like)
INSERT INTO subscription_plans (name, price, duration_days, duration_minutes, duration_unit, duration_value, features_json, is_active, sort_order)
SELECT * FROM (
  SELECT 'Free' AS name, 0 AS price, 30 AS duration_days, 0 AS duration_minutes, 'day' AS duration_unit, 30 AS duration_value, JSON_OBJECT('menu', true, 'orders', true, 'reports', false) AS features_json, 1 AS is_active, 0 AS sort_order
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Free');
