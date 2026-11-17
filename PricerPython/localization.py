"""Traductions de l'interface Streamlit."""

import streamlit as st

LANGUAGE_KEY = "app_language"

_OBLIGATION_COLUMN_LABELS = {
    "isin": ("ISIN", "ISIN"),
    "produit": ("Produit", "Product"),
    "type_obl": ("Type d'obligation", "Bond type"),
    "cusip": ("CUSIP", "CUSIP"),
    "obligation": ("Obligation", "Bond"),
    "emetteur": ("Émetteur", "Issuer"),
    "famille": ("Famille", "Family"),
    "sousfamille": ("Sous-famille", "Subfamily"),
    "secteur": ("Secteur", "Sector"),
    "type_bbg": ("Type Bloomberg", "Bloomberg type"),
    "convention_int": ("Convention d'intérêt", "Interest convention"),
    "date_premier_cpn": ("Date du premier coupon", "First coupon date"),
    "date_maturite": ("Date de maturité", "Maturity date"),
    "date_maturite_attendue": ("Date de maturité attendue", "Expected maturity date"),
    "date_annonce": ("Date d'annonce", "Announcement date"),
    "prix_remboursement": ("Prix de remboursement", "Redemption price"),
    "montant_emission": ("Montant de l'émission", "Issue amount"),
    "type_conversion": ("Type de conversion", "Conversion type"),
    "calendrier": ("Calendrier", "Calendar"),
    "coupon_hybride": ("Coupon hybride", "Hybrid coupon"),
    "convention_calc": ("Convention de calcul", "Calculation convention"),
    "devise": ("Devise", "Currency"),
    "prix_emission": ("Prix d'émission", "Issue price"),
    "lei": ("LEI", "LEI"),
}

_ERROR_TRANSLATIONS = {
    "Le panel de comparables ne peut pas être vide.": "The comparable panel cannot be empty.",
    "Le score de similarité doit être positif ou nul.": "The similarity score must be non-negative.",
    "La somme des scores de similarité doit être positive.": "The sum of similarity scores must be positive.",
    "nb_comparables doit être un entier positif ou nul.": "nb_comparables must be a non-negative integer.",
    "La date de fin doit être postérieure ou égale à la date de début.": "The end date must be on or after the start date.",
    "Convention de décompte non prise en charge.": "Unsupported day-count convention.",
    "Le coupon doit être positif ou nul.": "The coupon must be non-negative.",
    "Le nominal doit être strictement positif.": "The nominal must be greater than zero.",
    "Le prix de remboursement doit être strictement positif.": "The redemption price must be greater than zero.",
    "La fréquence doit être 1, 2, 4 ou 12 coupons par an.": "Frequency must be 1, 2, 4, or 12 coupons per year.",
    "La date de règlement doit être antérieure à l'échéance.": "The settlement date must be before maturity.",
    "Le rendement est incompatible avec la fréquence de capitalisation.": "The yield is incompatible with the compounding frequency.",
    "La période de coupon doit être strictement positive.": "The coupon period must be greater than zero.",
    "type_obl inconnu ou non compatible avec une obligation à taux fixe simple.": "Unknown bond type or incompatible with a plain fixed-rate bond.",
    "Le code type_bbg doit être vérifié manuellement pour confirmer une structure à taux fixe simple.": "Verify the Bloomberg type manually to confirm a plain fixed-rate structure.",
    "Le calendrier indiqué nécessite un ajustement de dates non pris en charge.": "The specified calendar requires an unsupported date adjustment.",
    "La convention_calc indiquée n'est pas prise en charge.": "The specified calculation convention is not supported.",
    "convention_int doit correspondre à la convention d'intérêts courus choisie.": "convention_int must match the selected accrued-interest convention.",
    "Une maturité attendue différente de l'échéance n'est pas prise en charge.": "An expected maturity different from the contractual maturity is not supported.",
    "La date d'annonce ne peut pas suivre la maturité.": "The announcement date cannot be after maturity.",
    "Le règlement avant le premier coupon ou un premier coupon après maturité n'est pas pris en charge.": "Settlement before the first coupon or a first coupon after maturity is not supported.",
    "La date du premier coupon est hors des bornes du calendrier.": "The first coupon date is outside the schedule bounds.",
    "Le premier coupon est trop ancien pour ce moteur.": "The first coupon is too far in the past for this engine.",
    "La date du premier coupon est irrégulière ; ce cas n'est pas pris en charge.": "The first coupon date is irregular; this case is not supported.",
    "Le rendement implicite est hors des bornes de calcul.": "The implied yield is outside the calculation bounds.",
    "L'émetteur et la devise sont obligatoires.": "Issuer and currency are required.",
    "Ce parcours ne traite que les obligations en EUR.": "This workflow only supports EUR bonds.",
    "Indiquez la source de la courbe zéro.": "Enter the zero-curve source.",
    "La date d'observation ne peut pas suivre la date de règlement.": "The observation date cannot be after the settlement date.",
    "La maturité ne peut dépasser 100 ans dans ce prototype.": "Maturity cannot exceed 100 years in this prototype.",
    "La courbe zéro doit contenir au moins un point.": "The zero curve must contain at least one point.",
    "Les points de courbe doivent être des nombres finis.": "Curve points must be finite numbers.",
    "Les maturités doivent être entre 0 et 100 ans, les taux entre -50 % et 100 %.": "Maturities must be between 0 and 100 years and rates between -50% and 100%.",
    "Les maturités de la courbe zéro doivent être distinctes.": "Zero-curve maturities must be unique.",
    "La source est obligatoire pour chaque comparable retenu.": "A source is required for every selected comparable.",
    "Chaque comparable retenu doit avoir un Z-spread et un score.": "Each selected comparable must have a Z-spread and a score.",
    "Le Z-spread doit être compris entre -5 000 et 5 000 pb.": "The Z-spread must be between -5,000 and 5,000 bps.",
    "Le score de similarité doit être compris entre 0 et 100.": "The similarity score must be between 0 and 100.",
    "Chaque comparable doit avoir un nom ou un ISIN.": "Each comparable must have a name or ISIN.",
    "Un motif est obligatoire pour chaque comparable exclu.": "A reason is required for every excluded comparable.",
    "Indiquez au moins un émetteur ou un ISIN pour enregistrer la fiche.": "Enter at least an issuer or ISIN to save the bond record.",
    "Chaque point de courbe doit avoir une maturité et un taux zéro.": "Each curve point must have a maturity and a zero rate.",
    "Moyenne des Z-spreads pondérée par les similarités saisies.": "Average of Z-spreads weighted by the entered similarity scores.",
    "Taux zéro continus, interpolation linéaire et extrapolation plate.": "Continuously compounded zero rates, linear interpolation, and flat extrapolation.",
    "exp(-(taux zéro + Z-spread) * temps), temps ACT/365 fixe.": "exp(-(zero rate + Z-spread) * time), with fixed ACT/365 time.",
    "YTM implicite correspondant au prix dirty, avec capitalisation à la fréquence du coupon.": "Implied YTM matching the dirty price, compounded at the coupon frequency.",
    "Convention renseignée, selon le moteur pricing.py.": "Entered convention, following the pricing.py engine.",
    "Sélection et scores renseignés par l'utilisateur, non automatisés.": "Comparable selection and scores are entered by the user, not automated.",
    "Prototype non validé pour la production ; les prix doivent être contrôlés par un expert.": "Prototype not validated for production; prices must be checked by an expert.",
}


def current_language() -> str:
    return st.session_state.get(LANGUAGE_KEY, "FR")


def text(french: str, english: str, language: str | None = None) -> str:
    selected_language = language or current_language()
    return english if selected_language == "EN" else french


def error_text(message: str) -> str:
    if current_language() == "EN":
        return _ERROR_TRANSLATIONS.get(message, message)
    return message


def obligation_column_label(
    column: str, language: str | None = None
) -> str:
    labels = _OBLIGATION_COLUMN_LABELS.get(column)
    if labels is None:
        return column
    return text(*labels, language=language)
