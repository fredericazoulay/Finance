-- Courbe des swaps EUR au pair (6M) par date d'observation, utilisée pour
-- bootstrapper la courbe zéro considérée comme sans risque dans le cas #3.
CREATE TABLE IF NOT EXISTS bp2s.swap_curve (
    curve_date  DATE NOT NULL,
    years       NUMERIC(6, 3) NOT NULL CHECK (years > 0 AND years <= 100),
    par_rate    NUMERIC(12, 6) NOT NULL CHECK (par_rate >= -0.5 AND par_rate <= 1),
    source_name TEXT NOT NULL,
    data_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (data_status IN ('official', 'unverified', 'synthetic_demo')),
    PRIMARY KEY (curve_date, years, source_name)
);

ALTER TABLE bp2s.swap_curve
    ADD COLUMN IF NOT EXISTS data_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (data_status IN ('official', 'unverified', 'synthetic_demo'));

CREATE INDEX IF NOT EXISTS ix_swap_curve_date
    ON bp2s.swap_curve (curve_date);

-- Prix clean observé (% du nominal) pour les sources qui ne fournissent pas
-- de YTM (ex. liste Euronext) ; le Z-spread est alors résolu depuis ce prix.
ALTER TABLE bp2s.market_observation
    ADD COLUMN IF NOT EXISTS clean_price NUMERIC(12, 6);
