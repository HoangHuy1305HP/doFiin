CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  access_hash TEXT NOT NULL UNIQUE,
  refresh_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS instruments (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolios (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  profile_role TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS portfolios_user_idx ON portfolios(user_id);
CREATE TABLE IF NOT EXISTS portfolio_versions (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
  version_number INTEGER NOT NULL,
  purchase_date TEXT,
  initial_capital TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(portfolio_id, version_number)
);
CREATE TABLE IF NOT EXISTS allocations (
  version_id TEXT NOT NULL REFERENCES portfolio_versions(id),
  instrument_id TEXT NOT NULL REFERENCES instruments(id),
  weight TEXT NOT NULL,
  PRIMARY KEY(version_id, instrument_id)
);
INSERT OR IGNORE INTO instruments VALUES
  ('aapl', 'AAPL', 'Apple', 'stock'),
  ('msft', 'MSFT', 'Microsoft', 'stock'),
  ('nvda', 'NVDA', 'NVIDIA', 'stock'),
  ('spy', 'SPY', 'SPDR S&P 500 ETF Trust', 'etf');
