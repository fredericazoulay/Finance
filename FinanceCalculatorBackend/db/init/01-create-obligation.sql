CREATE SCHEMA IF NOT EXISTS bp2s;

CREATE TABLE IF NOT EXISTS bp2s.obligation (
    isin                    VARCHAR(12) PRIMARY KEY,
    produit                 TEXT,
    type_obl                TEXT,
    cusip                   VARCHAR(9),
    obligation              TEXT,
    emetteur                TEXT,
    famille                 TEXT,
    sousfamille             TEXT,
    secteur                 TEXT,
    type_bbg                TEXT,
    convention_int          TEXT,
    date_premier_cpn        DATE,
    date_maturite           DATE,
    date_maturite_attendue  DATE,
    date_annonce            DATE,
    prix_remboursement      NUMERIC(20, 8),
    montant_emission        NUMERIC(24, 2),
    type_conversion         TEXT,
    calendrier              TEXT,
    coupon_hybride          TEXT,
    convention_calc         TEXT,
    devise                  VARCHAR(3),
    prix_emission           NUMERIC(20, 8),
    lei                     VARCHAR(20)
);
