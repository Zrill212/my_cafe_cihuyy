SET @has_setting_key := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'system_settings'
    AND COLUMN_NAME = 'setting_key'
);
SET @sql := IF(
  @has_setting_key = 0,
  'ALTER TABLE system_settings ADD COLUMN setting_key VARCHAR(100) NULL AFTER id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_setting_value := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'system_settings'
    AND COLUMN_NAME = 'setting_value'
);
SET @sql := IF(
  @has_setting_value = 0,
  'ALTER TABLE system_settings ADD COLUMN setting_value TEXT NULL AFTER setting_key',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_description := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'system_settings'
    AND COLUMN_NAME = 'description'
);
SET @sql := IF(
  @has_description = 0,
  'ALTER TABLE system_settings ADD COLUMN description VARCHAR(255) NULL AFTER setting_value',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_updated_at := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'system_settings'
    AND COLUMN_NAME = 'updated_at'
);
SET @sql := IF(
  @has_updated_at = 0,
  'ALTER TABLE system_settings ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_key_name := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'system_settings'
    AND COLUMN_NAME = 'key_name'
);
SET @sql := IF(
  @has_key_name > 0,
  'UPDATE system_settings SET setting_key = COALESCE(setting_key, key_name) WHERE (setting_key IS NULL OR setting_key = "") AND key_name IS NOT NULL AND key_name <> ""',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_value_col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'system_settings'
    AND COLUMN_NAME = 'value'
);
SET @sql := IF(
  @has_value_col > 0,
  'UPDATE system_settings SET setting_value = COALESCE(setting_value, value) WHERE setting_value IS NULL AND value IS NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DELETE s1 FROM system_settings s1
INNER JOIN system_settings s2
  ON s1.id > s2.id
 AND s1.setting_key = s2.setting_key
WHERE s1.setting_key IS NOT NULL
  AND s1.setting_key <> '';

UPDATE system_settings
SET setting_key = CONCAT('legacy_setting_', id)
WHERE setting_key IS NULL OR setting_key = '';

ALTER TABLE system_settings
  MODIFY COLUMN setting_key VARCHAR(100) NOT NULL;

SET @has_unique_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'system_settings'
    AND INDEX_NAME = 'uniq_setting_key'
);
SET @sql := IF(
  @has_unique_idx = 0,
  'ALTER TABLE system_settings ADD UNIQUE KEY uniq_setting_key (setting_key)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES
  ('system_name', 'ASTAKIRA Cafe Management', 'Nama sistem'),
  ('maintenance_mode', 'false', 'Mode maintenance (true/false)'),
  ('maintenanceMode', 'false', 'Mode maintenance frontend compatibility'),
  ('allow_registration', 'true', 'Izinkan pendaftaran cafe baru (true/false)'),
  ('email_notifications', 'true', 'Aktifkan notifikasi email (true/false)'),
  ('default_subscription_days', '30', 'Durasi langganan default (hari)')
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value),
  description = COALESCE(description, VALUES(description));
