py -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt

C:\Users\fazoulay\VSCode\Finance\PricerPython\.venv\Scripts\python.exe -m pip install --upgrade pip

.venv\Scripts\python.exe -m streamlit run streamlit_app.py

http://localhost:8501

docker compose --env-file "C:\Users\frede\VSCode\Finance\FinanceCalculatorBackend\.env" -f "C:\Users\frede\VSCode\Finance\FinanceCalculatorBackend\docker-compose.yml" exec -T postgres psql -U finance_pricer -d finance_pricer -c "SELECT * FROM bp2s.obligation LIMIT 10;"


`& "$env:LOCALAPPDATA\FinancePricer\pgsql\bin\pg_ctl.exe" -D "$env:LOCALAPPDATA\FinancePricer\data" -l "$env:LOCALAPPDATA\FinancePricer\postgres.log" -o "-h 127.0.0.1 -p 5432" start`


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

Le catalogue apparaît dans la page « Catalogue PostgreSQL », accessible depuis
la barre latérale de Streamlit.
Les 24 champs de chaque obligation sont affichés ; utilisez le menu « Colonnes »
de la grille pour masquer ou réafficher les champs souhaités. Le sélecteur
« Regrouper par » permet de choisir une ou plusieurs colonnes ; chaque groupe
repliable affiche son nombre de lignes. Les commandes permettent de tout
développer, tout réduire ou effacer le regroupement. Par défaut, les résultats
sont regroupés par devise.
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

L'en-tête affiche la page active et l'état de l'API ; la barre latérale indique
que le catalogue PostgreSQL est en lecture seule et regroupe la valorisation,
le calcul direct, le catalogue, les analyses et l'historique. Un pied de page
ancré en bas rappelle que l'application est un prototype utilisant des données
de démonstration. L'en-tête et le pied de page sont fixés sur toute la largeur
de l'application, y compris au-dessus de la barre latérale. Les six thèmes
standards (Light, Dark, Rainbow, Neon, Pop, Bloomberg) et les thèmes
personnalisés du frontend Angular sont disponibles dans le sélecteur. Les
palettes s'appliquent à l'en-tête, au pied de page, à la navigation, aux
formulaires et aux tableaux. Le bandeau comprend aussi
« Hackathon GDA 2026 JARVIS - Team PricerExMachina » et les logos locaux Caisse
des Dépôts / CDC Informatique.

La barre supérieure propose le profil local sans authentification, le groupe
`BO_CASH`, les environnements `INT`, `REC`, `PREX` et `PROD`, les thèmes du
frontend Angular et la langue française ou anglaise. Le profil, le groupe et
l'environnement sont des indicateurs visuels : ils ne modifient ni les droits
d'accès ni la connexion PostgreSQL, qui reste locale. Le statut « API » reflète
le résultat de `GET /health` (actualisé au plus toutes les 10 secondes) ; pour
le contrôler, démarrez l'API FastAPI séparément. `PRICER_API_URL` permet de
changer l'adresse interrogée.

Dans « Catalogue PostgreSQL », l'option « Alternate » alterne les couleurs des
lignes. Le regroupement fonctionne sur une ou plusieurs colonnes et peut être
développé, réduit ou effacé. Le bouton d'export Excel télécharge le catalogue
complet depuis PostgreSQL avec ses 24 colonnes, indépendamment de la recherche
qui limite l'affichage à 100 obligations.

Le comparateur affiche les titres sélectionnés côte à côte, y compris les
titres échus dont les métriques et le choc de taux ne sont pas calculables.
Le terminal marché propose les onglets SECF, DES, YAS et Graphique ; les
filtres SECF s'appliquent au graphique. DES reste accessible pour les titres
échus, tandis que YAS explique pourquoi un calcul est indisponible. Les
spreads utilisant la courbe EUR ne sont calculés que pour les titres en EUR.
L'écart YTM / taux zéro EUR utilise cette courbe swap et ne constitue pas un
G-spread souverain.
En l'absence de courbe enregistrée, une courbe de démonstration non datée est
utilisée et signalée ; les résultats ne sont pas des données de marché.
Les onglets dynamiques nécessitent Streamlit 1.55 ou plus.

### Panel automatique, agent juge et audit

La page « Panel automatique » classe les candidats de
`bp2s.market_observation` selon une méthode déterministe : devise exacte
(filtre bloquant), puis maturité (20 %), notation (25 %), type d'émetteur
(15 %), séniorité (15 %), type de coupon (10 %) et coupon (15 %). Les égalités
catégorielles valent 100 points ; l'écart de maturité retire 20 points par an
et l'écart de notation 25 points par cran. Le rapport détaille, pour chaque
candidat, les critères concordants, les écarts, les exclusions, la source et
les indicateurs de qualité pour les deux dates demandées.

Le seed présent est explicitement `synthetic_demo`, non daté et non officiel.
Ses `spread_bps` ne sont pas des Z-spreads ; la table ne contient pas non plus
de prix bid/ask ni de courbe zéro EUR datée. L'application bloque donc toute
valorisation de production à partir de ces données. La sélection est une
démonstration du classement, pas une estimation financière. Il faut importer
des observations licenciées et datées, les conventions/coupons, les prix et
les courbes correspondantes avant de calculer une juste valeur.

L'agent juge Mistral Large 4 peut challenger le panel automatique ou une
valorisation manuelle. Il examine les comparables, leurs sources, les données
de courbe et le résultat fourni, sans choisir les comparables ni modifier les
calculs. Chaque appel externe à Mistral exige un consentement explicite ; les
données affichées dans la confirmation sont transmises au service. La revue
est associée au rapport correspondant et incluse dans son export JSON.
L'envoi à la boîte d'audit n'a lieu qu'après confirmation explicite ; le
destinataire configuré est affiché avant confirmation et un relais SMTP est
nécessaire.

Dans « Valorisation par Z-spread », les comparables restent saisis et choisis
par l'utilisateur : l'application calcule une moyenne des Z-spreads pondérée
par les scores de similarité saisis. Cette page ne prétend donc pas découvrir
automatiquement les titres comparables. L'explication et les motifs de
sélection/exclusion sont conservés dans le rapport. Le « Panel automatique »
est la démonstration qui classe les observations du référentiel ; ses données
synthétiques et non datées ne permettent pas une juste valeur de marché.

Pour une base existante, appliquez une fois le script additif de création et
de seed du référentiel :

```powershell
Set-Location "C:\Users\frede\VSCode\Finance\FinanceCalculatorBackend"
docker compose --env-file .env exec -T postgres psql -v ON_ERROR_STOP=1 `
  -U finance_pricer -d finance_pricer `
  -f /docker-entrypoint-initdb.d/03-create-market-observations.sql
```

Le script est également exécuté automatiquement lors de l'initialisation d'une
base neuve. Configurez les variables suivantes dans l'environnement ou le
fichier `.env` local, sans versionner les secrets :

```text
MISTRAL_API_KEY=...
MISTRAL_MODEL=mistral-large-4-0
AUDIT_SMTP_HOST=...
AUDIT_SMTP_PORT=587
AUDIT_SMTP_USER=...
AUDIT_SMTP_PASSWORD=...
AUDIT_SMTP_STARTTLS=true
AUDIT_EMAIL_FROM=...
AUDIT_EMAIL_TO=audit@cdc.hackathon
```

`AUDIT_EMAIL_TO` est facultatif ; sans valeur, le destinataire est
`audit@cdc.hackathon`. L'adresse effective est montrée dans la confirmation
d'envoi.

### Tester les mails avec Mailpit

La dépendance Python `mailpit-api-client` permet de consulter les messages
capturés via l'API Mailpit. Elle n'installe ni ne démarre le serveur Mailpit,
qui doit être lancé séparément.

Pour un serveur Mailpit local utilisant ses ports par défaut, configurez le
fichier `.env` local (sans modifier la configuration SMTP de production) :

```text
AUDIT_SMTP_HOST=127.0.0.1
AUDIT_SMTP_PORT=1025
AUDIT_SMTP_USER=
AUDIT_SMTP_PASSWORD=
AUDIT_SMTP_STARTTLS=false
AUDIT_EMAIL_FROM=pricer@example.test
AUDIT_EMAIL_TO=audit@example.test
```

Les mails sont capturés localement, pas distribués aux destinataires réels.
L'interface Mailpit est accessible sur `http://127.0.0.1:8025`.
Le consentement explicite à l'envoi reste nécessaire dans l'application.
Pour consulter les messages depuis Python, avec Mailpit démarré :

```python
from mailpit.client.api import API

messages = API("127.0.0.1:8025").get_messages()
```

### Valorisation par Z-spread

La page « Valorisation par Z-spread » relie le panel, la courbe zéro et le
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
section `obligation` du rapport. La page « Catalogue PostgreSQL » consulte
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

**Limites** : le catalogue PostgreSQL et le nouveau référentiel sont des jeux
de démonstration synthétiques, non des données de marché officielles. Le panel
automatique explique son classement, mais ne calcule pas encore un Z-spread
depuis des cotations et une courbe officielle à deux dates. Le juge IA est un
challenge non décisionnel ; il ne remplace ni une validation humaine ni un
contrôle indépendant des données. L'historique SQLite local n'est pas un
registre d'audit réglementaire. Le calcul manuel ne traite pas les options,
coupons irréguliers, amortissements ni les calendriers de jours ouvrés.
ACT/ACT est ici une fraction par année civile, et la convention 30/360
implémentée doit être vérifiée pour le titre concerné. Ces hypothèses doivent
être validées par un spécialiste avant toute utilisation en production.

## Endpoints

Les routes de pricing utilisent `POST` et des corps JSON. Le catalogue
d'obligations est exposé en `GET`.

| Endpoint                | Corps de requête                                                                                                              | Résultat                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `/pricing/spread`     | `panel`: liste de `{spread_bps, similarity_score}`                                                                         | `weighted_spread_bps`                     |
| `/pricing/yield`      | `risk_free_rate`, `spread_bps`                                                                                             | `theoretical_yield`                       |
| `/pricing/confidence` | `nb_comparables`, `avg_similarity`, `data_quality`, `liquidity`                                                        | `confidence_score` entre 0 et 1           |
| `/pricing/price`      | `coupon`, `ytm`, `settlement_date`, `maturity_date`, `nominal`, `frequency`, `day_count`, `redemption_percent` | prix clean, prix dirty et intérêts courus |
| `GET /obligations`    | Paramètres facultatifs `search` (ISIN, émetteur ou nom) et `limit` (1 à 500, défaut 100)                               | Fiches du catalogue PostgreSQL              |
| `GET /health`         | Aucun                                                                                                                          | État de disponibilité de l'API            |

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
