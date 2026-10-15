-- Migration registry is not used for retroactively marking previous migrations as applied.
-- Subsequent migrations will use a checksummed migration runner; manual replay is forbidden.
CREATE TABLE IF NOT EXISTS fisher_migrations (
  version varchar(120) PRIMARY KEY,
  sha256 char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
