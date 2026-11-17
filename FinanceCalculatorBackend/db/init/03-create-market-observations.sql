CREATE TABLE IF NOT EXISTS bp2s.market_observation (
    observation_id          BIGSERIAL PRIMARY KEY,
    isin                    VARCHAR(12) NOT NULL,
    issuer                  TEXT,
    issuer_type             TEXT,
    bond_type               TEXT,
    currency                VARCHAR(3),
    issue_date              DATE,
    maturity_date           DATE,
    coupon_type             TEXT,
    coupon_rate_pct         NUMERIC(12, 6),
    day_count               TEXT,
    payment_frequency       SMALLINT,
    is_callable             BOOLEAN,
    is_putable              BOOLEAN,
    is_convertible          BOOLEAN,
    is_perpetual            BOOLEAN,
    is_inflation_linked     BOOLEAN,
    is_green_bond           BOOLEAN,
    is_social_bond          BOOLEAN,
    is_sustainability_bond  BOOLEAN,
    is_sustainability_linked BOOLEAN,
    is_secured              BOOLEAN,
    seniority               TEXT,
    rating_agency           TEXT,
    rating                  TEXT,
    country                 TEXT,
    market                  TEXT,
    face_value              NUMERIC(24, 2),
    yield_to_maturity_pct   NUMERIC(12, 6),
    spread_bps              NUMERIC(12, 4),
    esg_score               NUMERIC(8, 4),
    provider_claim          TEXT,
    reference_rate          TEXT,
    market_date             DATE,
    source_name             TEXT NOT NULL,
    data_status             TEXT NOT NULL
        CHECK (data_status IN ('synthetic_demo', 'unverified', 'official')),
    UNIQUE (isin, source_name)
);

CREATE INDEX IF NOT EXISTS ix_market_observation_currency_maturity
    ON bp2s.market_observation (currency, maturity_date);
CREATE INDEX IF NOT EXISTS ix_market_observation_rating_sector
    ON bp2s.market_observation (rating, issuer_type);

CREATE TEMP TABLE market_observation_seed (
    security_id          TEXT,
    isin                 TEXT,
    issuer               TEXT,
    issuer_type          TEXT,
    bond_type            TEXT,
    currency             TEXT,
    issue_date           TEXT,
    maturity_date        TEXT,
    coupon_type          TEXT,
    coupon_rate          TEXT,
    day_count            TEXT,
    payment_frequency    TEXT,
    callable             TEXT,
    putable              TEXT,
    convertible          TEXT,
    perpetual            TEXT,
    inflation_linked     TEXT,
    green_bond           TEXT,
    social_bond          TEXT,
    sustainability_bond  TEXT,
    sustainability_linked TEXT,
    secured              TEXT,
    seniority            TEXT,
    rating_agency        TEXT,
    rating               TEXT,
    country              TEXT,
    market               TEXT,
    face_value           TEXT,
    yield_to_maturity    TEXT,
    spread_bps           TEXT,
    esg_score            TEXT,
    data_provider        TEXT,
    reference_rate       TEXT
);

COPY market_observation_seed
FROM '/seed/universal-bond-dataset.csv'
WITH (FORMAT CSV, HEADER TRUE, DELIMITER ';', ENCODING 'UTF8');

INSERT INTO bp2s.market_observation (
    isin,
    issuer,
    issuer_type,
    bond_type,
    currency,
    issue_date,
    maturity_date,
    coupon_type,
    coupon_rate_pct,
    day_count,
    payment_frequency,
    is_callable,
    is_putable,
    is_convertible,
    is_perpetual,
    is_inflation_linked,
    is_green_bond,
    is_social_bond,
    is_sustainability_bond,
    is_sustainability_linked,
    is_secured,
    seniority,
    rating_agency,
    rating,
    country,
    market,
    face_value,
    yield_to_maturity_pct,
    spread_bps,
    esg_score,
    provider_claim,
    reference_rate,
    market_date,
    source_name,
    data_status
)
SELECT
    BTRIM(isin),
    NULLIF(BTRIM(issuer), ''),
    NULLIF(BTRIM(issuer_type), ''),
    NULLIF(BTRIM(bond_type), ''),
    NULLIF(BTRIM(currency), ''),
    TO_DATE(NULLIF(BTRIM(issue_date), ''), 'DD/MM/YYYY'),
    TO_DATE(NULLIF(BTRIM(maturity_date), ''), 'DD/MM/YYYY'),
    NULLIF(BTRIM(coupon_type), ''),
    NULLIF(REPLACE(BTRIM(coupon_rate), ',', '.'), '')::NUMERIC,
    NULLIF(BTRIM(day_count), ''),
    NULLIF(BTRIM(payment_frequency), '')::SMALLINT,
    CASE UPPER(BTRIM(callable)) WHEN 'VRAI' THEN TRUE WHEN 'FAUX' THEN FALSE END,
    CASE UPPER(BTRIM(putable)) WHEN 'VRAI' THEN TRUE WHEN 'FAUX' THEN FALSE END,
    CASE UPPER(BTRIM(convertible)) WHEN 'VRAI' THEN TRUE WHEN 'FAUX' THEN FALSE END,
    CASE UPPER(BTRIM(perpetual)) WHEN 'VRAI' THEN TRUE WHEN 'FAUX' THEN FALSE END,
    CASE UPPER(BTRIM(inflation_linked)) WHEN 'VRAI' THEN TRUE WHEN 'FAUX' THEN FALSE END,
    CASE UPPER(BTRIM(green_bond)) WHEN 'VRAI' THEN TRUE WHEN 'FAUX' THEN FALSE END,
    CASE UPPER(BTRIM(social_bond)) WHEN 'VRAI' THEN TRUE WHEN 'FAUX' THEN FALSE END,
    CASE UPPER(BTRIM(sustainability_bond)) WHEN 'VRAI' THEN TRUE WHEN 'FAUX' THEN FALSE END,
    CASE UPPER(BTRIM(sustainability_linked)) WHEN 'VRAI' THEN TRUE WHEN 'FAUX' THEN FALSE END,
    CASE UPPER(BTRIM(secured)) WHEN 'VRAI' THEN TRUE WHEN 'FAUX' THEN FALSE END,
    NULLIF(BTRIM(seniority), ''),
    NULLIF(BTRIM(rating_agency), ''),
    NULLIF(BTRIM(rating), ''),
    NULLIF(BTRIM(country), ''),
    NULLIF(BTRIM(market), ''),
    NULLIF(REPLACE(BTRIM(face_value), ',', '.'), '')::NUMERIC,
    NULLIF(REPLACE(BTRIM(yield_to_maturity), ',', '.'), '')::NUMERIC,
    NULLIF(REPLACE(BTRIM(spread_bps), ',', '.'), '')::NUMERIC,
    NULLIF(REPLACE(BTRIM(esg_score), ',', '.'), '')::NUMERIC,
    NULLIF(BTRIM(data_provider), ''),
    NULLIF(BTRIM(reference_rate), ''),
    NULL::DATE,
    'Universal_Bond_Pricer_Dataset_1000(Bonds_1000).csv',
    'synthetic_demo'
FROM market_observation_seed
WHERE NULLIF(BTRIM(isin), '') IS NOT NULL
ON CONFLICT (isin, source_name) DO UPDATE SET
    issuer = EXCLUDED.issuer,
    issuer_type = EXCLUDED.issuer_type,
    bond_type = EXCLUDED.bond_type,
    currency = EXCLUDED.currency,
    maturity_date = EXCLUDED.maturity_date,
    rating = EXCLUDED.rating,
    spread_bps = EXCLUDED.spread_bps,
    yield_to_maturity_pct = EXCLUDED.yield_to_maturity_pct,
    provider_claim = EXCLUDED.provider_claim,
    data_status = EXCLUDED.data_status;

DO $$
DECLARE
    seeded_count BIGINT;
BEGIN
    SELECT COUNT(*)
    INTO seeded_count
    FROM bp2s.market_observation
    WHERE source_name = 'Universal_Bond_Pricer_Dataset_1000(Bonds_1000).csv'
      AND data_status = 'synthetic_demo';

    IF seeded_count <> 1000 THEN
        RAISE EXCEPTION 'Expected 1000 synthetic market observations, got %',
            seeded_count;
    END IF;
END $$;
