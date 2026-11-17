py -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt

C:\Users\fazoulay\VSCode\Finance\PricerPython\.venv\Scripts\python.exe -m pip install --upgrade pip

.venv\Scripts\python.exe -m streamlit run streamlit_app.py

http://localhost:8501

docker compose --env-file "C:\Users\frede\VSCode\Finance\FinanceCalculatorBackend\.env" -f "C:\Users\frede\VSCode\Finance\FinanceCalculatorBackend\docker-compose.yml" exec -T postgres psql -U finance_pricer -d finance_pricer -c "SELECT * FROM bp2s.obligation LIMIT 10;"

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

### Connexion PostgreSQL

L'API et Streamlit lisent le catalogue `bp2s.obligation` en lecture seule.
Par défaut, la configuration est chargée depuis `PricerPython\.env`, puis
depuis `FinanceCalculatorBackend\.env` si le premier fichier n'existe pas.
Les variables `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`,
`POSTGRES_USER` et `POSTGRES_PASSWORD` déjà utilisées par Docker Compose sont
réutilisées. L'hôte par défaut est `127.0.0.1`, car Python s'exécute sur
Windows et PostgreSQL publie le port `5432`.

Démarrez d'abord PostgreSQL depuis le projet backend :

```powershell
Set-Location "C:\Users\frede\VSCode\Finance\FinanceCalculatorBackend"
docker compose --env-file .env up -d
```

Le catalogue apparaît dans l'onglet « Catalogue PostgreSQL » de Streamlit.
L'API propose également `GET /obligations?search=XS1000000002&limit=10`.
Si le fichier `.env` se trouve ailleurs, définissez `POSTGRES_ENV_FILE` avec
son chemin complet avant de lancer l'API ou Streamlit. Ne versionnez jamais
ces fichiers de configuration locaux.

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

### Valorisation par Z-spread

L'onglet « Valorisation par Z-spread » relie le panel, la courbe zéro et le
calcul du prix. Il s'appuie sur le cas d'usage n° 3 (pages 23-24) du document
`Hackathon Gestion d'Actifs - Cas d'usages - 12nov26.pdf` : Z-spread,
comparables, méthode explicable et courbe swap EUR 6 mois.

1. Renseigner l'obligation, la date d'observation et la date de règlement.
2. Saisir les comparables de cette date, leur Z-spread, leur score et leur
   source ; préciser un motif pour tout titre exclu.
3. Saisir la source et les points d'une **courbe de taux zéro EUR** dérivée
   des swaps EUR 6 mois, en capitalisation continue. Les taux swap au pair ne
   sont pas directement des taux zéro. Les Z-spreads saisis doivent eux aussi
   être compatibles avec une capitalisation continue.
4. Calculer et enregistrer. L'historique permet d'afficher les résultats de
   plusieurs dates et de télécharger chaque rapport JSON avec les hypothèses,
   les flux, les comparables et leurs motifs d'exclusion.

#### Fiche obligation

Le formulaire permet de saisir les 24 champs du schéma `OBLIGATION` :
`isin`, `produit`, `type_obl`, `cusip`, `obligation`, `emetteur`, `famille`,
`sousfamille`, `secteur`, `type_bbg`, `convention_int`, `date_premier_cpn`,
`date_maturite`, `date_maturite_attendue`, `date_annonce`, `prix_remboursement`,
`montant_emission`, `type_conversion`, `calendrier`, `coupon_hybride`,
`convention_calc`, `devise`, `prix_emission` et `lei`.

Le bouton « Enregistrer la fiche seule » conserve ces champs dans l'historique
SQLite local, même lorsque l'instrument n'est pas valorisable ; aucun prix
n'est alors calculé. Les fiches sont visibles et téléchargeables depuis
l'historique. Une valorisation réussie inclut également les 24 champs dans la
section `obligation` du rapport. L'onglet « Catalogue PostgreSQL » consulte
la table `bp2s.obligation` en lecture seule ; il ne modifie pas cette table.
L'enregistrement d'une fiche ne valide pas sa compatibilité financière.

Pour les titres pris en charge, `prix_remboursement` est un pourcentage du
nominal (100 par défaut), utilisé dans le dernier flux et dans le calcul du
YTM. La devise doit être EUR. Si un premier coupon est renseigné, il doit
appartenir à l'échéancier régulier et ne pas suivre la date de règlement.
Une maturité attendue différente de la maturité contractuelle, un calendrier
avec ajustement, une conversion, un coupon hybride, un type de taux autre que
fixe ou une convention de calcul non reconnue bloquent le pricing.
`convention_int`, lorsqu'elle est renseignée, doit correspondre exactement à
la convention choisie dans le formulaire. Le code `type_bbg` est conservé
sans interprétation automatique : lorsqu'il est renseigné, l'utilisateur doit
confirmer qu'il correspond à une structure à taux fixe simple sans option.
Les autres champs descriptifs sont conservés sans influencer les flux ni
la sélection manuelle des comparables.

Le calcul utilise une moyenne de Z-spreads pondérée par les scores manuels,
une interpolation linéaire des taux zéro et une extrapolation plate. Les
flux sont actualisés en temps ACT/365 fixe ; le YTM affiché est celui qui
reproduit le prix dirty selon le moteur de calcul direct. Il ne s'agit pas
d'une simple addition du taux swap et du Z-spread.

Les résultats sont stockés dans `data\valuations.sqlite3`, ignoré par Git.
Cette base locale n'est ni chiffrée, ni authentifiée, ni infalsifiable : elle
ne constitue pas un registre d'audit réglementaire. Ne pas l'utiliser pour
des données sensibles sur un poste partagé sans protections complémentaires.

**Limites** : le catalogue PostgreSQL fourni est un jeu de démonstration
synthétique et non des données de marché officielles. Aucune extraction IA,
sélection automatique, reconstruction de courbe swap, contrôle par un second
agent ou envoi de courriel d'audit n'est implémenté. Le calcul ne traite pas
les options, coupons irréguliers, amortissements ni les calendriers de jours
ouvrés. ACT/ACT est ici une fraction par année civile, et la convention
30/360 implémentée doit être vérifiée pour le titre concerné. Ces hypothèses
doivent être validées par un spécialiste avant toute utilisation en production.

## Endpoints

Les routes de pricing utilisent `POST` et des corps JSON. Le catalogue
d'obligations est exposé en `GET`.

| Endpoint                | Corps de requête                                                                                      | Résultat                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `/pricing/spread`     | `panel`: liste de `{spread_bps, similarity_score}`                                                 | `weighted_spread_bps`                     |
| `/pricing/yield`      | `risk_free_rate`, `spread_bps`                                                                     | `theoretical_yield`                       |
| `/pricing/confidence` | `nb_comparables`, `avg_similarity`, `data_quality`, `liquidity`                                | `confidence_score` entre 0 et 1           |
| `/pricing/price`      | `coupon`, `ytm`, `settlement_date`, `maturity_date`, `nominal`, `frequency`, `day_count`, `redemption_percent` | prix clean, prix dirty et intérêts courus |
| `GET /obligations` | Paramètres facultatifs `search` (ISIN, émetteur ou nom) et `limit` (1 à 500, défaut 100) | Fiches du catalogue PostgreSQL |

Les taux (`coupon`, `ytm`, `risk_free_rate`) sont des nombres décimaux
annuels : `0.04` représente 4 %. Les spreads sont en points de base.
`redemption_percent` s'exprime en pourcentage du nominal (100 par défaut).
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
