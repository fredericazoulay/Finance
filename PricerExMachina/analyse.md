
Read
Completed with input: {
  "path": "C:\\Users\\fazoulay\\VSCode\\Finance\\FinanceCalculatorBackend\\Hackathon\\need.txt"
}

Read
Completed with input: {
  "path": "C:\\Users\\fazoulay\\VSCode\\Finance\\FinanceCalculatorBackend\\Hackathon\\QUICKSTART.pdf"
}

Read
Completed with input: {
  "path": "C:\\Users\\fazoulay\\VSCode\\Finance\\FinanceCalculatorBackend\\Hackathon\\studio-demo-deck-mna-walkthrough-FR.pdf"
}

Search for `Mistral|Studio|agent|Agents|Knowledge|Tools|workflow|workflows|API key|API Ke...`

Searched the web for `Mistral AI Studio documentation create agent knowledge base tools agent build...`
Completed with input: {
  "query": "Mistral AI Studio documentation create agent knowledge base tools agent builder API 2026"
}

Searched the web for `Mistral AI Agents API documentation tools function calling agent persistence ...`
Completed with input: {
  "query": "Mistral AI Agents API documentation tools function calling agent persistence Python SDK"
}

Read , line 1
Completed with input: {
  "path": "C:\\Users\\fazoulay\\VSCode\\Finance\\FinanceCalculatorBackend\\Hackathon",
  "view_range": [
    1,
    1
  ]
}

Read , lines 1 to 100
Completed with input: {
  "path": "C:\\Users\\fazoulay\\VSCode\\Finance\\FinanceCalculatorBackend\\Hackathon\\studio-demo-deck-mna-walkthrough-FR.pdf",
  "view_range": [
    1,
    100
  ]
}

Read , lines 1 to 100
Completed with input: {
  "path": "C:\\Users\\fazoulay\\VSCode\\Finance\\FinanceCalculatorBackend\\Hackathon\\QUICKSTART.pdf",
  "view_range": [
    1,
    100
  ]
}

Searched the web for `site:docs.mistral.ai/studio PostgreSQL connector agent tool SQL database Mist...`
Completed with input: {
  "query": "site:docs.mistral.ai/studio PostgreSQL connector agent tool SQL database Mistral Studio custom tool"
}

Searched the web for `site:docs.mistral.ai/studio workflows tool nodes agent app Mistral Studio dep...`
Completed with input: {
  "query": "site:docs.mistral.ai/studio workflows tool nodes agent app Mistral Studio deploy workflow API"
}

"Fetch Web Content" failed
Completed with input: {"url":"https://docs.mistral.ai/studio"}
Tool execution failed: web_fetch could not retrieve this URL: the request failed at the network proxy, before reaching the site.

"Fetch Web Content" failed
Completed with input: {
  "url": "https://docs.mistral.ai/studio/agents/agents-api",
  "max_length": 12000
}
Tool execution failed: web_fetch could not retrieve this URL: the request failed at the network proxy, before reaching the site.

"Fetch Web Content" failed
Completed with input: {
  "url": "https://docs.mistral.ai/studio/agents/capabilities/tools",
  "max_length": 10000
}
Tool execution failed: web_fetch could not retrieve this URL: the request failed at the network proxy, before reaching the site.

"Fetch Web Content" failed
Completed with input: {
  "url": "https://docs.mistral.ai/studio/workflows/overview",
  "max_length": 10000
}
Tool execution failed: web_fetch could not retrieve this URL: the request failed at the network proxy, before reaching the site.

Je ne peux pas créer directement un fichier dans l’espace de travail depuis cette session en lecture seule. Voici le document prêt à enregistrer sous `Hackathon/guide-agent-pricing-obligations.md`.

**Limite sur la source :** j’ai pu lire le besoin dans `need.txt`, mais pas extraire le contenu des diapositives du PDF `studio-demo-deck-mna-walkthrough-FR.pdf`, qui est fourni ici sous forme de données PDF brutes. Le guide ci-dessous s’appuie donc sur le besoin et sur la documentation Mistral Studio actuelle.

# Guide — Agent de pricing d’obligations avec Mistral Studio

## 1. Objectif

Construire un agent qui aide à évaluer une nouvelle obligation en la comparant aux titres du marché secondaire stockés dans PostgreSQL. Pour chacune des deux dates d’observation, l’outil doit restituer :

- un Z-spread estimé et un yield indicatif ;
- le prix théorique associé, si les données nécessaires sont disponibles ;
- les obligations comparables retenues et les critères de sélection ;
- une explication traçable de la méthode et de ses limites.

**Principe de conception :** Mistral interprète la demande et orchestre les outils ; le code applicatif sélectionne les comparables et effectue les calculs financiers déterministes. Le modèle ne doit ni inventer des données manquantes ni exécuter des requêtes SQL libres.

## 2. Architecture proposée

```text
Utilisateur
    │ caractéristiques de l’obligation
    ▼
API de pricing ──► Agent Mistral Studio
    │                    │
    │                    ├── outil de recherche des comparables
    │                    ├── outil de calcul Z-spread / valorisation
    │                    └── agent de contrôle
    │
    ├── PostgreSQL (lecture seule)
    ├── courbe swap EUR 6M par date
    └── service d’audit (courriel vers audit@cdc.hackathon)
```

Les identifiants PostgreSQL restent dans l’environnement du service, jamais dans les instructions de l’agent. Si l’agent ou le workflow s’exécute dans le cloud Mistral, il faut prévoir un worker ou un service déployé dans un environnement autorisé, capable d’accéder à la base sans l’exposer publiquement. La documentation Mistral présente les agents et les workflows comme des composants distincts ; les workflows peuvent appeler du code exécuté dans votre environnement. Voir [Mistral Studio](https://docs.mistral.ai/studio), [Agents &amp; Conversations](https://docs.mistral.ai/studio/agents/agents-api) et [Workflows](https://docs.mistral.ai/studio/workflows/overview).

## 3. Fichiers à créer

Exemple de structure Python. Les noms peuvent être adaptés aux conventions du dépôt.

```text
pricing-agent/
├── README.md
├── pyproject.toml
├── .env.example
├── Dockerfile
├── app/
│   ├── main.py
│   ├── schemas.py
│   ├── agent.py
│   ├── tools.py
│   ├── repository.py
│   ├── peer_selection.py
│   ├── valuation.py
│   ├── supervisor.py
│   └── audit.py
├── migrations/
│   └── 001_pricing_audit.sql
└── tests/
    ├── test_peer_selection.py
    ├── test_valuation.py
    └── test_pricing_flow.py
```

### Rôle des fichiers

- **`README.md`** — installation, configuration, lancement, déploiement, limites et exemples de requêtes.
- **`pyproject.toml`** — dépendances et outils de test/formatage. Ajouter le SDK Mistral, un pilote PostgreSQL, une bibliothèque de validation de schémas et, si retenu, un solveur numérique.
- **`.env.example`** — noms des variables attendues, sans valeurs secrètes : `MISTRAL_API_KEY`, `DATABASE_URL`, configuration du service de courriel.
- **`Dockerfile`** — exécution reproductible du service ou du worker, si nécessaire au mode de déploiement choisi.
- **`app/schemas.py`** — schémas validés de la demande et de la réponse : devise, émetteur, secteur, rating, séniorité, maturité, coupon, dates d’observation et caractéristiques optionnelles (call, label ESG, etc.).
- **`app/main.py`** — point d’entrée API : reçoit la demande, valide les champs et renvoie le résultat structuré.
- **`app/agent.py`** — configure l’agent Mistral, ses instructions et les outils autorisés.
- **`app/tools.py`** — expose des opérations bornées à l’agent, par exemple `find_comparables` et `price_bond`. L’agent choisit ces outils ; il ne formule pas de SQL.
- **`app/repository.py`** — accès PostgreSQL en lecture seule, avec requêtes paramétrées. Centralise le mapping entre le schéma réel des tables et les objets métier.
- **`app/peer_selection.py`** — critères de comparabilité, règles de repli, exclusions et pondération des titres.
- **`app/valuation.py`** — calculs numériques : flux de trésorerie, interpolation de courbe, estimation du spread et calcul du prix/yield.
- **`app/supervisor.py`** — contrôles indépendants : cohérence des unités, nombre minimal de comparables, données manquantes, résultat hors limites et respect des règles métier.
- **`app/audit.py`** — produit une trace structurée et gère son envoi vers la boîte d’audit. Il doit signaler explicitement un échec d’envoi.
- **`migrations/001_pricing_audit.sql`** — uniquement si aucune table d’audit adéquate n’existe déjà ; ne pas recréer les tables de marché fournies.
- **`tests/`** — tests ciblés pour les filtres de comparables, les calculs financiers et les cas où les données sont insuffisantes.

## 4. Préparer Mistral Studio

1. Ouvrir [Mistral Studio](https://console.mistral.ai/home), choisir le workspace autorisé et créer une clé API pour l’application.
2. Stocker la clé dans le gestionnaire de secrets de l’environnement d’exécution. Ne pas l’ajouter au dépôt, aux notebooks ou aux journaux.
3. Créer/configurer un agent avec un nom explicite, par exemple **Bond Pricing Assistant**. Choisir un modèle disponible dans le workspace et vérifier son adéquation aux règles de confidentialité de l’organisation.
4. Ajouter des instructions précisant que l’agent doit :
   - demander les caractéristiques manquantes ;
   - appeler les outils applicatifs pour obtenir les comparables et les calculs ;
   - ne jamais inventer un titre, un spread, une courbe ou un résultat ;
   - signaler les données insuffisantes et les règles de repli utilisées ;
   - restituer les résultats séparément pour les deux dates.
5. Connecter les outils applicatifs documentés dans `app/tools.py`. L’accès à PostgreSQL doit rester côté backend ou worker, et être limité aux opérations nécessaires. Pour les outils personnalisés, voir la [documentation Mistral sur les tools](https://docs.mistral.ai/studio/agents/capabilities/tools).
6. Si le parcours comprend plusieurs étapes contrôlées (analyse, recherche, valorisation, supervision, audit), l’implémenter comme workflow. Tester chaque étape dans Studio avant de déployer le worker ou l’application.

Les intitulés précis des menus Studio peuvent évoluer ; vérifier la navigation et les options proposées dans le workspace au moment de la mise en œuvre.

## 5. Constituer le panel de comparables

Pour chaque date d’observation, appliquer les filtres dans un ordre défini et conservé dans la trace :

1. **Filtres stricts :** date, devise, disponibilité d’un prix de marché valide et caractéristiques obligataires compatibles.
2. **Proximité de crédit :** émetteur d’abord, puis secteur et rating selon des règles explicites.
3. **Structure :** séniorité, maturité, coupon et options (call, put), en donnant une attention particulière aux caractéristiques atypiques.
4. **Règles de repli :** si le panel est trop petit, relâcher les critères par étapes documentées, sans masquer le changement à l’utilisateur.
5. **Classement et pondération :** utiliser une méthode reproductible, par exemple une pondération selon la proximité de maturité et de rating. Éviter qu’un seul comparable atypique domine l’estimation.

Conserver pour chaque titre utilisé son identifiant, sa date, ses données pertinentes, son spread source et son poids. Si aucun panel suffisamment pertinent n’est trouvé, retourner « estimation non robuste » ou demander une validation humaine plutôt que produire un chiffre trompeur.

## 6. Calcul et restitution

Pour chaque date, le backend doit :

1. Charger la courbe swap EUR 6M correspondant à cette date et vérifier sa couverture des échéances pertinentes.
2. Calculer ou récupérer les spreads des comparables selon la convention de marché retenue.
3. Estimer le Z-spread de la nouvelle obligation à partir du panel, avec une méthode déterministe documentée — par exemple une médiane pondérée — et afficher les hypothèses ou ajustements appliqués.
4. Reconstituer les flux de l’obligation cible et valoriser ces flux avec la courbe et le spread estimé, selon les conventions retenues (calendrier, day count, fréquence de coupon, accrued interest).
5. Calculer le yield comme le taux actuariel qui correspond au prix obtenu. Le yield n’est pas nécessairement égal au taux swap à maturité plus le Z-spread : cette somme peut être présentée comme approximation indicative, mais le calcul doit préciser la méthode utilisée.

Les deux dates doivent être traitées séparément : ne pas réutiliser une courbe ou un prix de l’une pour l’autre sans justification.

### Format de réponse recommandé

```json
{
  "obligation": {"issuer": "...", "currency": "EUR"},
  "valuations": [
    {
      "observation_date": "YYYY-MM-DD",
      "z_spread_bps": 0,
      "yield_percent": 0,
      "theoretical_price": 0,
      "comparables": [],
      "methodology": "...",
      "warnings": []
    }
  ],
  "audit_status": "sent"
}
```

Les valeurs `0` ci-dessus sont des exemples de forme, pas des valeurs par défaut à renvoyer en cas d’erreur. En l’absence de données nécessaires, le système doit retourner un statut d’erreur ou une réponse indiquant clairement que l’estimation n’a pas pu être calculée.

## 7. Supervision, audit et tests

L’agent superviseur doit contrôler le résultat avec des règles vérifiables : comparables effectivement présents dans la réponse de la base, date correcte, cohérence des devises, courbe disponible, calcul réalisable et écarts plausibles. Il doit pouvoir refuser une sortie ou demander une revue humaine ; il ne doit pas valider automatiquement une estimation simplement parce qu’elle paraît bien formulée.

La trace envoyée à `audit@cdc.hackathon` devrait contenir la demande structurée, les filtres appliqués, les identifiants des comparables, les sources et dates des données, la méthode de calcul, les avertissements, les contrôles du superviseur et le statut d’envoi. Ne pas inclure de secrets ni de données personnelles non nécessaires.

Tester au minimum les trois situations du besoin :

- beaucoup de comparables ;
- peu de comparables, mais un univers proche ;
- aucun point pour l’émetteur, peu de titres proches ou caractéristiques atypiques.

Ajouter aussi des tests pour une courbe incomplète, une donnée manquante, un panel vide et une erreur d’envoi d’audit. Vérifier que la perte d’une information ne provoque pas de variation injustifiée ou silencieuse.

## 8. Sécurité et prérequis à confirmer

Avant l’implémentation, identifier le schéma PostgreSQL, les conventions de marché utilisées, la source des courbes et le format des deux jeux de données. Le compte de base doit être en lecture seule pour les données de marché et limité aux tables nécessaires. Les accès réseau, secrets, journaux et données transmis au modèle doivent respecter les règles de sécurité et de confidentialité de l’organisation.

**Critère de mise en service :** aucun prix ou spread n’est présenté comme robuste sans comparables identifiables, données de courbe compatibles, conventions explicites et contrôles réussis.
