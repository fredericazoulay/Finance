# PricerExMachina — agent de pricing obligataire

Application locale de pricing à partir d’obligations comparables. FastAPI expose le service, PostgreSQL fournit les observations officielles en lecture seule, et Mistral ne fait qu’expliquer les résultats déterministes. Une interface Streamlit présente les résultats et les comparables.

## Utilisation des dépendances

Les dépendances de `requirements.txt` sont déclarées dans `pyproject.toml` et utilisées dans ces composants :

| Bibliothèque | Utilisation |
|---|---|
| FastAPI / Uvicorn | API HTTP et serveur ASGI (`app/main.py`). |
| psycopg | Requêtes fixes et paramétrées, en transaction PostgreSQL read-only (`app/repository.py`). |
| python-dotenv | Chargement local des variables d’environnement. |
| openpyxl | Validation et prévisualisation en lecture seule de classeurs de données (`app/importer.py`). |
| pytest / httpx | Tests de l’API, des traitements et des intégrations. |
| mailpit-api-client | Vérification des messages d’audit dans une boîte Mailpit de développement (`GET /api/audit/mailpit`). |
| Streamlit / matplotlib | Interface de demande de pricing, prévisualisation de classeur et graphique des comparables (`streamlit_app.py`). |
| QuantLib | Courbe zéro et dates/day-count utilisés dans les actualisations (`app/valuation.py`). |
| scikit-learn / NumPy | Sélection des comparables les plus proches et calculs vectorisés. |
| SciPy | Résolution numérique du yield actuariel. |
| Mistral SDK | Explication facultative des résultats transmis à `/api/assistant`; le modèle n’accède ni à PostgreSQL ni aux calculs. |

## Installation et démarrage

Python 3.10+ est requis. Créer un environnement virtuel selon les pratiques du projet, puis :

```powershell
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Configurer uniquement les services autorisés dans `.env`. Ne pas versionner ce fichier ni y enregistrer des secrets. Pour utiliser PostgreSQL, définir `DATABASE_URL` avec un compte en lecture seule.

Démarrer l’API :

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8080
```

Dans un autre terminal, démarrer l’interface :

```powershell
python -m streamlit run streamlit_app.py
```

L’API est disponible à `http://127.0.0.1:8080`; l’interface Streamlit affiche l’URL locale à son démarrage. Pour pointer l’interface vers une autre API, définir `PRICER_API_URL`.

## Endpoints

- `GET /health` — disponibilité du service et état de configuration de PostgreSQL.
- `POST /api/pricing` — calcul par date d’observation et envoi conditionnel de la trace d’audit si SMTP est configuré.
- `POST /api/assistant` — explication facultative d’un résultat déjà calculé ; nécessite `MISTRAL_API_KEY`.
- `POST /api/market-data/preview` — corps binaire `.xlsx`, maximum 10 MB ; valide et prévisualise les feuilles `market_observations` et, facultativement, `zero_curve`. **Aucune écriture** n’est effectuée.
- `GET /api/audit/mailpit` — métadonnées des messages récents de Mailpit, sans exposer leurs corps.

### Exemple de demande de pricing

Les valeurs sont un exemple de structure, pas des données de marché :

```json
{
  "target": {
    "isin": "TARGET-ISIN",
    "issuer": "Example Issuer",
    "issuer_type": "Financial",
    "rating": "A",
    "seniority": "Senior",
    "currency": "EUR",
    "maturity_date": "2030-06-01",
    "cashflows": [
      {"payment_date": "2027-06-01", "amount": 4.0},
      {"payment_date": "2030-06-01", "amount": 104.0}
    ],
    "accrued_interest_by_date": {
      "2026-10-27": 0.0,
      "2026-10-28": 0.01
    }
  },
  "observation_dates": ["2026-10-27", "2026-10-28"],
  "selection": {
    "maturity_tolerance_months": 24,
    "minimum_comparables": 3,
    "maximum_comparables": 20,
    "match_fields": ["issuer", "rating", "seniority"],
    "spread_measure": "z_spread_bps"
  },
  "zero_curves": [
    {
      "observation_date": "2026-10-27",
      "source": "Source explicite de la courbe zéro",
      "data_status": "official",
      "nodes": [
        {"time_years": 0.5, "zero_rate": 0.02},
        {"time_years": 5.0, "zero_rate": 0.03}
      ]
    }
  ]
}
```

`maximum_comparables` et `minimum_comparables` doivent être fournis explicitement. Les filtres stricts imposent une observation à la date exacte, la même devise, un statut officiel, l’exclusion de l’ISIN cible et le respect de la tolérance de maturité. Les correspondances des champs demandés sont exactes. Scikit-learn classe ensuite les titres admissibles par distance standardisée de maturité et, lorsque les ratings sont reconnus, de rating. Le spread du panel retenu est sa médiane non pondérée.

Le champ de la base `spread_bps` n’identifie pas sa convention. Le demandeur doit confirmer explicitement `z_spread_bps`; sinon, l’application ne qualifie pas la médiane de Z-spread et ne calcule pas de prix/yield.

## Méthode de valorisation

Pour chaque date séparément, l’application actualise les cashflows fournis à l’aide d’une courbe zéro correspondant à cette même date, selon les conventions suivantes : ACT/365F, interpolation linéaire des taux zéro et capitalisation continue, plus un Z-spread constant. QuantLib calcule les facteurs d’actualisation, NumPy agrège les valeurs, et SciPy résout le yield annualisé effectif correspondant au prix dirty.

Les nœuds doivent couvrir chaque flux ; aucune extrapolation n’est faite. Les cashflows et l’intérêt couru ne sont pas reconstruits. Un prix clean n’est restitué que si l’intérêt couru est fourni pour cette date. La table `bp2s.swap_curve` contient des taux par, pas une courbe zéro : elle n’est ni assimilée ni transformée sans convention de bootstrap approuvée.

## Excel et données de marché

La feuille `market_observations` du classeur de prévisualisation doit au minimum contenir les colonnes `isin`, `currency`, `maturity_date`, `market_date`, `spread_bps`, `source_name` et `data_status`. La feuille `zero_curve`, si présente, doit contenir `observation_date`, `tenor_years`, `zero_rate`, `source_name` et `data_status`. Les colonnes de dates acceptent des cellules Excel de date ou des chaînes ISO `YYYY-MM-DD`.

La prévisualisation sert à vérifier la structure et les lignes; elle ne charge pas de données dans PostgreSQL et ne remplace pas l’approvisionnement officiel de la base.

## Audit et limites de l’environnement

Si `SMTP_HOST` et `SMTP_FROM` sont définis, `/api/pricing` envoie la trace structurée vers `AUDIT_TO` (par défaut `audit@cdc.hackathon`). Une erreur d’envoi est restituée comme `audit_status: failed` et consignée côté serveur. Pour un test local, Mailpit écoute usuellement SMTP sur le port 1025 et son API sur le port 8025. Le client Mailpit ne sert qu’à inspecter la boîte de développement ; il n’envoie pas le courriel.

Les données de démonstration du dépôt ne suffisent pas à produire une valorisation de marché : elles ne comportent pas les dates d’observation requises et les spreads ne sont pas qualifiés. Il faut importer des observations officielles datées, confirmer les conventions de spread, fournir une courbe zéro approuvée et transmettre les cashflows nécessaires.

## Recommandations Mistral Studio (présentation SIGMA)

Le parcours présenté dans [SIGMA-Presentation-Mistral](../FinanceCalculatorBackend/Hackathon/SIGMA-Presentation-Mistral.pdf) est un workflow en quatre temps : collecte, contrôles/analyses parallèles, scoring, puis approbation humaine (HITL). Pour l’obligataire, les vérifications parallèles peuvent porter sur la qualité des données, la pertinence des comparables et les conventions de valorisation ; seul le moteur déterministe de l’application calcule le prix et le spread.

Versionner les prompts Studio, conserver leur identifiant/version avec les traces et évaluer chaque version sur un jeu de cas historiques validés. Mesurer séparément panel, erreur de spread/prix et traitement des cas incomplets ; ne pas reprendre le score de 68 % montré dans la présentation comme seuil de fiabilité du pricer.

**Limite actuelle :** ce dépôt n’installe ni ne déploie un workflow Studio, les contrôles parallèles ou l’approbation HITL. Mistral est actuellement limité à l’explication facultative des résultats. Ces éléments nécessitent une configuration et une validation dans le workspace Studio avant mise en production.

## Tests

```powershell
python -m pytest -q
```

Les tests n’utilisent pas de base PostgreSQL, de compte Mistral, de serveur SMTP ni de service Mailpit réel.
