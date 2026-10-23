# Backend Pricer Finance

Ce document décrit le backend Java situé dans `Finance/PricerBackend`. Il s'appuie sur les contrôleurs, DTO et services du code courant. Les noms « Bloomberg-style » désignent le format de certaines requêtes et réponses; ils ne signifient pas que l'application se connecte à Bloomberg.

## Périmètre

Le backend expose une API Spring Boot de pricing et de calculateurs financiers. Les valeurs de marché nécessaires aux calculs sont généralement fournies dans la requête. L'application ne persiste pas les requêtes et ne télécharge pas de cotations pour alimenter les endpoints de pricing.

Les principales capacités HTTP sont :

- recherche de titres via l'API de recherche Yahoo Finance;
- pricing d'options, d'obligations, d'actions, de swaps de taux, de CDS et de forwards de change;
- calculs financiers génériques;
- estimation du prix d'une obligation cible à partir du YTM le plus élevé d'un panel fourni par le client.

## Architecture et prérequis

| Élément | Valeur |
|---|---|
| Langage | Java 17 |
| Framework | Spring Boot 3.3.3 |
| Build | Maven, artefact `com.finance:pricer:1.0.0` au format JAR |
| Entrée Spring Boot | `com.finance.pricer.api.BloombergPricerApplication` |
| Port par défaut | `9092` |

Le `pom.xml` utilise `src` comme répertoire des sources Java, `src/main/resources` pour les ressources et `src/test/java` pour les tests. Les paquets applicatifs comprennent `api`, `core`, `credit`, `fixedincome`, `linear`, `multiasset`, `options`, `rates` et `risk`.

### Lancer et tester

Depuis PowerShell :

```powershell
Set-Location "C:\Users\fazoulay\VSCode\Finance\PricerBackend"
mvn test
mvn spring-boot:run
```

Le serveur écoute sur `http://localhost:9092` par défaut. Il faut un JDK 17 et Maven disponibles dans l'environnement.

La documentation OpenAPI et Swagger UI sont disponibles à :

- `http://localhost:9092/v3/api-docs`
- `http://localhost:9092/swagger-ui/index.html`

La configuration expose également Actuator `health` et `info` sous `/actuator`. Les détails de santé sont activés dans la configuration actuelle.

> Les chemins Windows/JDK affichés dans les README historiques ne correspondent pas tous à ce workspace. Utilisez le chemin de projet ci-dessus et le Java 17 déclaré dans le `pom.xml`.

## API REST

Base URL locale : `http://localhost:9092`. Les exemples ci-dessous utilisent des taux sous forme décimale : `0.05` représente `5 %`.

### Santé, catalogue et recherche de titres

| Méthode et chemin | Comportement |
|---|---|
| `GET /api/health` et `GET /api/v1/health` | État statique du service. |
| `GET /api/products`, `/api/v1/products`, `/api/bloomberg/catalog`, `/api/v1/blp/catalog` | Catalogue statique des produits. |
| `GET /api/securities/search?q={terme}` | Relaye la recherche Yahoo Finance et renvoie le JSON amont. |

La réponse de santé est de la forme `{"status":"UP","service":"Finance Pricer API"}`. Le catalogue retourne une propriété `products` comprenant `EQUITY_OPTION`, `FIXED_INCOME_BOND`, `EQUITY`, `INTEREST_RATE_SWAP`, `CREDIT_DEFAULT_SWAP` et `FX_FORWARD`.

Pour `GET /api/securities/search`, le paramètre `q` est requis et ne doit pas être vide. La requête amont demande jusqu'à 25 titres sans actualités. Une erreur ou interruption de Yahoo Finance est renvoyée en `502`; une requête vide produit `400`.

### Pricing au format Bloomberg-style

Les quatre endpoints suivants acceptent `BloombergPricingRequest` et répondent avec `BloombergPricingResponse` :

| Méthode et chemin | Résultat principal |
|---|---|
| `POST /api/v1/blp/pricing/equity-option` | Prix, Greeks et unités des Greeks. |
| `POST /api/v1/blp/pricing/irs` | Taux swap par et valeur actuelle. |
| `POST /api/v1/blp/pricing/cds` | Taux de défaut implicite. |
| `POST /api/v1/blp/pricing/fx-forward` | Cours forward. |

L'enveloppe de requête commune contient `request_id`, `security_id`, `security_name`, `product`, `curve_name`, `market_data_source`, `pricing_model`, `market_data` et `instrument`. Les champs `market_data` et `instrument` varient par produit :

| Produit | Données de marché | Instrument |
|---|---|---|
| Option | `underlying_spot`, `risk_free_rate`, `implied_volatility`, `dividend_yield` | `strike`, `maturity_years`, `option_type`, `exercise_style`; `exercise_times_years` pour les dates Bermudéennes |
| IRS | `tenors`, `discount_curve_rates`, `frequency` | `notional`, `fixed_rate`, `maturity_years`, `payment_frequency`, `receiver` |
| CDS | `tenors`, `discount_curve_rates`, `frequency` | `notional`, `spread`, `maturity_years`, `payment_frequency`, `recovery_rate` |
| FX forward | `spot`, `domestic_rate`, `foreign_rate` | `pair`, `maturity_years` |

Exemple d'option européenne :

```json
{
	"request_id": "REQ-OPT-1001",
	"security_id": "AAPL US Equity",
	"security_name": "AAPL US Equity",
	"product": "EQTY_OPT",
	"curve_name": "USD-SOFR",
	"market_data_source": "user-input",
	"pricing_model": "BLACK_SCHOLES",
	"market_data": {
		"underlying_spot": 100.0,
		"risk_free_rate": 0.05,
		"implied_volatility": 0.2,
		"dividend_yield": 0.01
	},
	"instrument": {
		"strike": 100.0,
		"maturity_years": 1.0,
		"option_type": "CALL",
		"exercise_style": "EUROPEAN"
	}
}
```

La réponse contient les métadonnées de requête (`request_id`, statut, horodatage UTC, identifiant, produit, courbe et source) et deux objets : `result` et `metadata`. Pour une option, `result` comprend `price`, `currency` (`USD`) et `greeks` (`delta`, `gamma`, `theta`, `vega`, `rho`). `metadata.greek_units` précise que theta est par jour calendaire, vega par point de volatilité (1 %) et rho par point de taux d'intérêt (1 %); delta et gamma sont rapportés par unité du sous-jacent et par unité au carré. Les autres produits utilisent respectivement `par_rate`/`present_value`, `implied_hazard_rate` ou `forward_price` dans `result`.

Les options sélectionnent le modèle via `Models.create`. Les noms reconnus sont `BLACK_SCHOLES`/`BS`, `BINOMIAL`/`CRR`/`AMERICAN`/`BERMUDAN`, `MONTE_CARLO`/`MC` et `DISCOUNTED_CASH_FLOW`/`DCF`. L'endpoint d'option utilise aussi le style d'exercice fourni; lorsqu'il est omis, il choisit `AMERICAN` ou `BERMUDAN` si le modèle porte ce nom, et sinon `EUROPEAN`.

### Routes de compatibilité

Ces routes renvoient des maps JSON plus simples et ne partagent pas l'enveloppe Bloomberg-style complète.

| Méthode et chemins | Entrée principale | Sortie principale |
|---|---|---|
| `POST /api/price/option`, `POST /api/v1/bloomberg/pricing/equity-option` | Strike, échéance, type/style, spot, taux, volatilité, dividende et modèle | `price`, `greeks`, `greek_units` |
| `POST /api/price/bond`, `POST /api/v1/bloomberg/pricing/fixed-income-bond`, `POST /api/v1/blp/pricing/fixed-income-bond` | Valeur faciale, coupon, fréquence, échéance, YTM et modèle | `price` |
| `POST /api/price/stock`, `POST /api/v1/bloomberg/pricing/equity`, `POST /api/v1/blp/pricing/equity` | Dividende prévisionnel, croissance, spot, taux d'actualisation et modèle | `price` |
| `POST /api/v1/bloomberg/pricing/irs` | Courbe de taux et paramètres du swap | `par_rate`, `present_value` |
| `POST /api/v1/bloomberg/pricing/cds` | Courbe de taux et paramètres du CDS | `implied_hazard_rate` |
| `POST /api/v1/bloomberg/pricing/fx-forward` | Spot, taux domestique/étranger, paire et échéance | `pair`, `forward_price` |

Les montants et prix renvoyés par ces routes sont libellés `USD`. Les routes IRS et CDS construisent une courbe depuis les tenors et taux transmis; l'API ne télécharge pas de courbe de marché.

### Calculateurs financiers génériques

`GET /api/v1/calculators` renvoie un catalogue classé par catégories. `POST /api/v1/calculators/{calculator}` accepte un corps `FinancialCalculatorRequest` et renvoie une map commençant par `calculator`, suivie des champs de résultat propres au calcul.

Exemple :

```http
POST /api/v1/calculators/compound-interest
Content-Type: application/json
```

```json
{
	"principal": 1000.0,
	"annualRate": 0.05,
	"termYears": 5,
	"compoundsPerYear": 12
}
```

La requête accepte les champs de `FinancialCalculatorRequest` en camelCase; les propriétés inconnues sont ignorées. Les paramètres requis dépendent du calculateur. Le service vérifie notamment les valeurs positives/non négatives et rejette les noms inconnus avec une erreur `400`.

Les calculateurs reconnus par le service comprennent :

| Domaine | Noms acceptés |
|---|---|
| Crédit | `loan`, `payment`, `mortgage`, `auto-loan`, `student-loan`, `refinance`, `debt-payoff`, `credit-card`, `credit-card-payoff`, `apr` |
| Immobilier et location | `house-affordability`, `affordability`, `rent`, `auto-lease`, `lease` |
| Épargne et investissement | `simple-interest`, `compound-interest`, `savings`, `investment`, `cd`, `bond`, `bond-price`, `bond-pricing`, `roi`, `irr`, `payback-period`, `present-value`, `future-value`, `annuity`, `annuity-payout`, `retirement`, `401k`, `ira` |
| Fiscalité et revenus | `sales-tax`, `vat`, `income-tax`, `salary`, `take-home-paycheck` |
| Entreprise et divers | `depreciation`, `margin`, `discount`, `commission`, `currency`, `inflation` |

Les noms sont normalisés en minuscules et les underscores sont convertis en tirets avant le dispatch. Le catalogue est une sélection organisée de noms; il ne répertorie pas nécessairement tous les alias acceptés par le service.

### Pricing obligataire à partir de comparables

`POST /api/v1/calculators/bonds/comparables/pricing` reçoit la cible et tout le panel dans la requête. Il ne recherche pas lui-même des obligations ni des cotations.

```json
{
	"target": {
		"securityId": "TARGET-001",
		"name": "Target bond",
		"currency": "EUR",
		"faceValue": 100.0,
		"couponRate": 0.04,
		"couponFrequency": 2,
		"maturityDate": "2031-10-23",
		"settlementDate": "2026-10-23",
		"dayCount": "30/360"
	},
	"panel": [
		{
			"securityId": "COMP-001",
			"name": "Comparable bond",
			"issuer": "Example issuer",
			"currency": "EUR",
			"maturityDate": "2032-04-23",
			"yieldToMaturity": 0.052,
			"couponRate": 0.045,
			"marketPrice": 97.2,
			"rating": "A",
			"source": "User import",
			"asOf": "2026-10-22"
		}
	],
	"maturityToleranceMonths": 24
}
```

Règles appliquées :

- la tolérance d'échéance vaut 24 mois par défaut; elle doit être comprise entre 0 et 240;
- la cible doit avoir un identifiant, une devise, une valeur faciale, un coupon, une fréquence et des dates de maturité/règlement valides;
- un comparable est exclu si ses données sont incomplètes, si sa devise diffère, si sa maturité est invalide/hors tolérance, si son YTM est invalide ou s'il s'agit de la cible elle-même;
- parmi les lignes admissibles, le YTM le plus élevé est sélectionné; si plusieurs rendements sont égaux, l'identifiant départage le tri;
- le YTM sélectionné est appliqué aux flux de la cible pour calculer prix clean, prix dirty, intérêts courus et nombre de jours courus.

La réponse fournit `targetSecurityId`, `currency`, `maturityToleranceMonths`, le `panel` avec indicateurs `eligible`, `selected` et `exclusionReason`, `bestYieldSecurityId`, `appliedYield` et `valuation`. Cette dernière contient `cleanPrice`, `dirtyPrice`, `accruedInterest`, `accruedDays` et `dayCount`. Les champs de panel tels que `source` et `asOf` sont déclaratifs : leur exactitude dépend de l'import réalisé par le client. Si aucune ligne n'est admissible, l'API renvoie une erreur `400`.

## Modèles et services

Le moteur historique repose notamment sur `Instrument`, `MarketData`, `PricingModel` et la fabrique `Models`. Les instruments de base comprennent `Option`, `Bond`, `Stock`, `InterestRateSwap` et `CreditDefaultSwap`. Les pricers appelés par l'API incluent `SwapPricer`, `DiscountCurve`, `CdsPricer`, `FxForwardPricer` et `OptionGreekCalculator`.

`ComprehensivePricerService` regroupe également des méthodes pour les forwards, métriques obligataires, options américaines/exotiques, stratégies multi-jambes, cap/floor, swaptions, CDS et mesures de risque/stress. Ce service n'est pas un contrôleur REST : sa présence ne signifie pas que ces méthodes disposent d'endpoints HTTP dédiés.

## Données de marché et persistance

Aucune base de données, datasource, entité ORM ou repository n'est configuré dans ce backend. Les endpoints de pricing calculent à partir des valeurs reçues dans le corps HTTP. Les champs `market_data_source` et `curve_name` sont recopiés dans la réponse comme métadonnées et ne sélectionnent aucun connecteur Bloomberg, Reuters ou autre.

La seule intégration externe visible dans le contrôleur est la recherche Yahoo Finance de `GET /api/securities/search`. Les classes `MarketDataProvider`, `InMemoryMarketDataProvider` et `CsvMarketDataProvider` permettent de représenter des snapshots locaux; elles ne sont pas branchées aux routes REST décrites ici. Le provider CSV lit un fichier local simple et ne constitue pas une ingestion de marché.

## Validation, erreurs et CORS

Les contrôleurs appliquent `@Valid` sur plusieurs corps de requête, mais les DTO Bloomberg ont des champs nullable sans contraintes de validation métier visibles. `@Valid` ne remplace donc pas la validation des données requises par chaque modèle.

`GlobalExceptionHandler` renvoie :

| Situation | Statut HTTP | Corps usuel |
|---|---:|---|
| Erreur de validation Bean Validation | `400` | `status: ERROR`, `message: Validation failed`, erreurs par champ |
| `IllegalArgumentException` | `400` | `status: ERROR`, message |
| Autre exception | `500` | `status: ERROR`, message |
| Recherche Yahoo indisponible/interrompue | `502` | message d'erreur de recherche |

Les deux contrôleurs autorisent CORS depuis `http://localhost:4200` uniquement. Cette origine doit être adaptée si le frontend est servi depuis une autre origine ou un autre port.

## Tests et scripts

Les tests JUnit se trouvent sous `src/test/java`. Ils couvrent notamment les conventions de jour, calendriers, courbes, factory/modèles, providers de marché, validations d'instruments, calculs financiers et contrôleur API. Lancer la suite Maven depuis la racine backend :

```powershell
mvn test
```

Le script `build_and_test.ps1` compile et exécute des self-tests du moteur historique; il ne remplace pas `mvn test` pour l'application Spring/API. Les scripts `run.ps1` et `run.cmd` ciblent les classes du moteur historique et ne constituent pas le lanceur du serveur Spring Boot. Pour l'API, utiliser `mvn spring-boot:run`.

## Limites fonctionnelles à garder en tête

- Les prix calculés ne sont pas alimentés par un flux de marché automatique; il faut transmettre les inputs de marché dans la requête.
- La recherche Yahoo renvoie des résultats de recherche de titres, pas un panel obligataire avec YTM et prix garanti à jour.
- Le endpoint de comparables classe le rendement le plus élevé; il ne calcule pas un score de risque/rendement ni une recommandation d'investissement.
- Les modèles et providers internes non reliés à un contrôleur ne sont pas accessibles via HTTP sans nouvelle intégration.
- Les taux sont attendus en décimal pour les contrats de pricing/calcul décrits ici; `0.03` signifie `3 %`, sauf indication contraire du champ métier.
- Les routes historiques et les routes Bloomberg-style n'ont pas toutes le même format d'entrée ou de sortie; se référer au chemin exact utilisé par le client.

## Fichiers de référence

- [pom.xml](../PricerBackend/pom.xml) : dépendances, versions Java et configuration Maven.
- [application.properties](../PricerBackend/src/main/resources/application.properties) : port, nom d'application et endpoints Actuator.
- [PricingController.java](../PricerBackend/src/com/finance/pricer/api/controller/PricingController.java) : routes de pricing, Yahoo Finance et DTO locaux de compatibilité.
- [FinancialCalculatorController.java](../PricerBackend/src/com/finance/pricer/api/controller/FinancialCalculatorController.java) : catalogue et routes des calculateurs/comparables.
- [FinancialCalculatorService.java](../PricerBackend/src/com/finance/pricer/api/service/FinancialCalculatorService.java) : dispatch et implémentation des calculateurs.
- [BondComparablesPricingService.java](../PricerBackend/src/com/finance/pricer/api/service/BondComparablesPricingService.java) : admissibilité, classement et application du YTM.
- [GlobalExceptionHandler.java](../PricerBackend/src/com/finance/pricer/api/controller/GlobalExceptionHandler.java) : traduction des erreurs en réponses HTTP.
- [Models.java](../PricerBackend/src/com/finance/pricer/Models.java) : sélection des modèles de pricing.
