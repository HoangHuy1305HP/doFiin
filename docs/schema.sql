BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 0001_phase_one

CREATE TABLE users (
    id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (email)
);

CREATE TABLE sessions (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    client_type VARCHAR(10) NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    rotated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_session_client CHECK (client_type IN ('web', 'mobile')),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX ix_sessions_user_id ON sessions (user_id);

CREATE TABLE instruments (
    id UUID NOT NULL,
    symbol VARCHAR(30) NOT NULL,
    name VARCHAR(255) NOT NULL,
    exchange VARCHAR(50) NOT NULL,
    asset_type VARCHAR(20) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_symbol VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_instrument_exchange_symbol UNIQUE (exchange, symbol),
    CONSTRAINT ck_instrument_type CHECK (asset_type IN ('STOCK', 'ETF', 'INDEX'))
);

CREATE INDEX ix_instruments_symbol ON instruments (symbol);

CREATE TABLE portfolios (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    base_currency VARCHAR(3) NOT NULL,
    current_version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    CONSTRAINT ck_portfolio_currency CHECK (base_currency = 'USD'),
    CONSTRAINT ck_portfolio_current_version CHECK (current_version >= 1),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX ix_portfolios_user_id ON portfolios (user_id);

CREATE TABLE portfolio_versions (
    id UUID NOT NULL,
    portfolio_id UUID NOT NULL,
    version_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_portfolio_version UNIQUE (portfolio_id, version_number),
    CONSTRAINT ck_version_positive CHECK (version_number > 0),
    FOREIGN KEY(portfolio_id) REFERENCES portfolios (id) ON DELETE RESTRICT
);

CREATE TABLE portfolio_allocations (
    portfolio_version_id UUID NOT NULL,
    instrument_id UUID NOT NULL,
    weight NUMERIC(12, 10) NOT NULL,
    PRIMARY KEY (portfolio_version_id, instrument_id),
    CONSTRAINT ck_allocation_weight CHECK (weight > 0 AND weight <= 1),
    FOREIGN KEY(portfolio_version_id) REFERENCES portfolio_versions (id) ON DELETE RESTRICT,
    FOREIGN KEY(instrument_id) REFERENCES instruments (id) ON DELETE RESTRICT
);

CREATE FUNCTION check_allocation_total() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE version_id uuid; total numeric;
        BEGIN
            IF TG_TABLE_NAME = 'portfolio_versions' THEN version_id := NEW.id;
            ELSE version_id := NEW.portfolio_version_id; END IF;
            SELECT COALESCE(SUM(weight), 0) INTO total
              FROM portfolio_allocations WHERE portfolio_version_id = version_id;
            IF total <> 1 THEN
                RAISE EXCEPTION 'Allocation total must equal 1'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NULL;
        END; $$;;

CREATE CONSTRAINT TRIGGER ct_version_total
        AFTER INSERT ON portfolio_versions DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION check_allocation_total();;

CREATE CONSTRAINT TRIGGER ct_allocation_total
        AFTER INSERT ON portfolio_allocations DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION check_allocation_total();;

CREATE FUNCTION forbid_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Portfolio allocation history is immutable; create a new version'
                USING ERRCODE = '23514';
        END; $$;;

CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON portfolio_versions
            FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();;

CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON portfolio_allocations
            FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();;

INSERT INTO alembic_version (version_num) VALUES ('0001_phase_one') RETURNING alembic_version.version_num;

-- Running upgrade 0001_phase_one -> 0002_demo_one

CREATE TABLE price_bars (
    instrument_id UUID NOT NULL,
    trading_date DATE NOT NULL,
    source VARCHAR(10) NOT NULL,
    adjusted_close NUMERIC(22, 8) NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (instrument_id, trading_date, source),
    CONSTRAINT ck_price_positive CHECK (adjusted_close > 0),
    CONSTRAINT ck_price_source CHECK (source IN ('demo', 'yahoo')),
    FOREIGN KEY(instrument_id) REFERENCES instruments (id)
);

CREATE TABLE analysis_runs (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    portfolio_version_id UUID NOT NULL,
    benchmark_instrument_id UUID NOT NULL,
    parameters JSONB NOT NULL,
    result JSONB NOT NULL,
    engine_version VARCHAR(30) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES users (id),
    FOREIGN KEY(portfolio_version_id) REFERENCES portfolio_versions (id),
    FOREIGN KEY(benchmark_instrument_id) REFERENCES instruments (id)
);

CREATE INDEX ix_analysis_owner_created ON analysis_runs (user_id, created_at);

CREATE TABLE backtest_runs (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    analysis_run_id UUID NOT NULL,
    parameters JSONB NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES users (id),
    FOREIGN KEY(analysis_run_id) REFERENCES analysis_runs (id)
);

CREATE INDEX ix_backtest_owner_created ON backtest_runs (user_id, created_at);

CREATE TABLE dashboard_layouts (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    page_key VARCHAR(20) NOT NULL,
    revision INTEGER NOT NULL,
    config JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_layout_user_page UNIQUE (user_id, page_key),
    FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE demo_subscriptions (
    user_id UUID NOT NULL,
    plan_code VARCHAR(10) NOT NULL,
    billing_cycle VARCHAR(10) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT ck_demo_plan CHECK (plan_code IN ('free', 'plus', 'pro')),
    CONSTRAINT ck_demo_cycle CHECK (billing_cycle IN ('monthly', 'annual')),
    FOREIGN KEY(user_id) REFERENCES users (id)
);

UPDATE alembic_version SET version_num='0002_demo_one' WHERE alembic_version.version_num = '0001_phase_one';

COMMIT;
