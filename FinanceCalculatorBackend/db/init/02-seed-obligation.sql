CREATE TEMP TABLE obligation_seed_source (
    security_id          TEXT,
    isin                 TEXT,
    issuer               TEXT,
    issuer_type          TEXT,
    bond_type            TEXT,
    currency              TEXT,
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
    social_bond           TEXT,
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

COPY obligation_seed_source
FROM '/seed/universal-bond-dataset.csv'
WITH (FORMAT CSV, HEADER TRUE, DELIMITER ';', ENCODING 'UTF8');

INSERT INTO bp2s.obligation (
    isin,
    produit,
    type_obl,
    cusip,
    obligation,
    emetteur,
    famille,
    sousfamille,
    secteur,
    type_bbg,
    convention_int,
    date_premier_cpn,
    date_maturite,
    date_maturite_attendue,
    date_annonce,
    prix_remboursement,
    montant_emission,
    type_conversion,
    calendrier,
    coupon_hybride,
    convention_calc,
    devise,
    prix_emission,
    lei
)
SELECT
    BTRIM(isin),
    'Obligation',
    NULLIF(BTRIM(bond_type), ''),
    NULL,
    CONCAT_WS(
        ' | ',
        NULLIF(BTRIM(security_id), ''),
        NULLIF(BTRIM(issuer), ''),
        NULLIF(BTRIM(coupon_type), '') || ' coupon ' || REPLACE(BTRIM(coupon_rate), ',', '.') || '%',
        NULLIF(BTRIM(rating_agency), '') || ' ' || NULLIF(BTRIM(rating), ''),
        'yield ' || REPLACE(BTRIM(yield_to_maturity), ',', '.') || '%',
        'spread ' || BTRIM(spread_bps) || ' bps',
        'issue date ' || BTRIM(issue_date),
        'face value ' || BTRIM(face_value),
        'ESG score ' || BTRIM(esg_score),
        'market ' || BTRIM(market),
        'country ' || BTRIM(country),
        'provider ' || BTRIM(data_provider),
        'reference rate ' || BTRIM(reference_rate),
        NULLIF(
            CONCAT_WS(
                ', ',
                CASE WHEN UPPER(BTRIM(callable)) = 'VRAI' THEN 'callable' END,
                CASE WHEN UPPER(BTRIM(putable)) = 'VRAI' THEN 'putable' END,
                CASE WHEN UPPER(BTRIM(convertible)) = 'VRAI' THEN 'convertible' END,
                CASE WHEN UPPER(BTRIM(perpetual)) = 'VRAI' THEN 'perpetual' END,
                CASE WHEN UPPER(BTRIM(inflation_linked)) = 'VRAI' THEN 'inflation-linked' END,
                CASE WHEN UPPER(BTRIM(green_bond)) = 'VRAI' THEN 'green' END,
                CASE WHEN UPPER(BTRIM(social_bond)) = 'VRAI' THEN 'social' END,
                CASE WHEN UPPER(BTRIM(sustainability_bond)) = 'VRAI' THEN 'sustainability' END,
                CASE WHEN UPPER(BTRIM(sustainability_linked)) = 'VRAI' THEN 'sustainability-linked' END,
                CASE WHEN UPPER(BTRIM(secured)) = 'VRAI' THEN 'secured' END
            ),
            ''
        )
    ),
    NULLIF(BTRIM(issuer), ''),
    NULLIF(BTRIM(issuer_type), ''),
    NULLIF(BTRIM(seniority), ''),
    NULL,
    NULLIF(BTRIM(coupon_type), ''),
    NULLIF(BTRIM(day_count), ''),
    NULL,
    TO_DATE(BTRIM(maturity_date), 'DD/MM/YYYY'),
    NULL,
    NULL,
    NULL,
    NULL,
    CASE
        WHEN UPPER(BTRIM(convertible)) = 'VRAI' THEN 'Convertible'
        WHEN UPPER(BTRIM(convertible)) = 'FAUX' THEN 'Non convertible'
    END,
    NULLIF(BTRIM(payment_frequency), ''),
    CASE
        WHEN UPPER(BTRIM(bond_type)) = 'HYBRID'
        THEN REPLACE(BTRIM(coupon_rate), ',', '.') || '%'
    END,
    NULL,
    NULLIF(BTRIM(currency), ''),
    NULL,
    NULL
FROM obligation_seed_source
WHERE NULLIF(BTRIM(isin), '') IS NOT NULL
ON CONFLICT (isin) DO NOTHING;

DO $$
DECLARE
    source_count BIGINT;
    unique_isin_count BIGINT;
    bond_type_count BIGINT;
    issuer_type_count BIGINT;
    coupon_type_count BIGINT;
    seeded_count BIGINT;
BEGIN
    SELECT
        COUNT(*),
        COUNT(DISTINCT NULLIF(BTRIM(isin), '')),
        COUNT(DISTINCT NULLIF(BTRIM(bond_type), '')),
        COUNT(DISTINCT NULLIF(BTRIM(issuer_type), '')),
        COUNT(DISTINCT NULLIF(BTRIM(coupon_type), ''))
    INTO
        source_count,
        unique_isin_count,
        bond_type_count,
        issuer_type_count,
        coupon_type_count
    FROM obligation_seed_source;

    IF source_count <> 1000
        OR unique_isin_count <> 1000
        OR bond_type_count <> 18
        OR issuer_type_count <> 6
        OR coupon_type_count <> 2
    THEN
        RAISE EXCEPTION 'Expected 1000 unique obligations covering 18 bond types, 6 issuer types, and 2 coupon types; got % rows, % ISINs, % bond types, % issuer types, and % coupon types',
            source_count,
            unique_isin_count,
            bond_type_count,
            issuer_type_count,
            coupon_type_count;
    END IF;

    SELECT COUNT(*)
    INTO seeded_count
    FROM bp2s.obligation AS target
    JOIN obligation_seed_source AS source
        ON target.isin = BTRIM(source.isin);

    IF seeded_count <> 1000 THEN
        RAISE EXCEPTION 'Expected all 1000 source obligations in bp2s.obligation; found %', seeded_count;
    END IF;
END
$$;
