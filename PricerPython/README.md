# API de pricing obligataire

API Python de prototype pour calculer un spread pondéré, un rendement
théorique, un prix obligataire et un score de confiance. La documentation
OpenAPI est servie automatiquement par FastAPI.

## Installation et démarrage

Depuis `Finance\PricerPython` :

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app:app --reload
```

Ouvrir ensuite `http://127.0.0.1:8000/docs` pour la documentation
interactive ou `http://127.0.0.1:8000/openapi.json` pour le schéma OpenAPI.

## Interface Streamlit

L'interface utilise directement le moteur de calcul Python ; l'API FastAPI
n'a pas besoin d'être démarrée pour utiliser l'application :

```powershell
streamlit run streamlit_app.py
```

L'application s'ouvre par défaut sur `http://localhost:8501`. Elle permet de
calculer un prix clean/dirty, d'établir un spread pondéré et un rendement
théorique à partir d'un panel saisi manuellement, et d'estimer un score de
confiance. Aucune source de marché n'est interrogée.

## Endpoints

Tous les endpoints utilisent `POST` et des corps JSON.

| Endpoint | Corps de requête | Résultat |
|---|---|---|
| `/pricing/spread` | `panel`: liste de `{spread_bps, similarity_score}` | `weighted_spread_bps` |
| `/pricing/yield` | `risk_free_rate`, `spread_bps` | `theoretical_yield` |
| `/pricing/confidence` | `nb_comparables`, `avg_similarity`, `data_quality`, `liquidity` | `confidence_score` entre 0 et 1 |
| `/pricing/price` | `coupon`, `ytm`, `settlement_date`, `maturity_date`, `nominal`, `frequency`, `day_count` | prix clean, prix dirty et intérêts courus |

Les taux (`coupon`, `ytm`, `risk_free_rate`) sont des nombres décimaux
annuels : `0.04` représente 4 %. Les spreads sont en points de base.
Les valeurs de similarité, qualité et liquidité sont normalisées entre 0
et 1. Pour le score de confiance, cinq comparables ou plus saturent le
facteur « nombre de comparables ».

## Prix et coupon fractionné

Le calcul actualise le coupon suivant avec une période fractionnaire égale
à la fraction de jours restant dans la période de coupon, puis les flux
suivants à intervalles réguliers. Le prix dirty est la valeur actuelle des
flux. Le prix clean est le prix dirty diminué des intérêts courus.

La fréquence doit être 1, 2, 4 ou 12 paiements par an. Les conventions
d'intérêts courus acceptées sont `ACT/ACT` (défaut), `ACT/365`, `ACT/360`
et `30/360`. Ce moteur est un prototype : les obligations à coupon
irrégulier, callable, amortissable ou assorties de conventions de marché
spécifiques nécessitent une modélisation dédiée.

Exemple de requête pour `/pricing/price` :

```json
{
  "coupon": 0.04,
  "ytm": 0.05,
  "settlement_date": "2025-04-01",
  "maturity_date": "2030-01-01",
  "nominal": 100,
  "frequency": 2,
  "day_count": "ACT/ACT"
}
```

## Tests

```powershell
python -m pytest -q
```
