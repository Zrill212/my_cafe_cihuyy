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
