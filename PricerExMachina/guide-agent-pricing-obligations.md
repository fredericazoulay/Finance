# Guide de création d’un agent de pricing d’obligations

> **Sources et limite :** ce guide s’appuie sur le besoin du hackathon et la documentation Mistral Studio. Le contenu des diapositives du PDF `studio-demo-deck-mna-walkthrough-FR.pdf` n’a pas pu être extrait dans cette session ; les étapes propres à cette présentation ne sont donc pas reprises.

## Objectif

Construire un agent qui évalue une nouvelle obligation à partir de titres comparables du marché secondaire conservés dans PostgreSQL. Pour chacune des deux dates d’observation, l’outil doit restituer :

- le Z-spread estimé et le yield indicatif ;
- le prix théorique, si les données nécessaires sont disponibles ;
- les obligations comparables retenues et les critères de sélection ;
- une explication traçable de la méthode, des hypothèses et des limites.

Le modèle Mistral interprète la demande et orchestre des outils. Le code applicatif sélectionne les comparables et exécute les calculs financiers déterministes. Le modèle ne doit ni inventer de données ni exécuter des requêtes SQL libres.

## Architecture cible

```text
Utilisateur
    │ caractéristiques de l’obligation
    ▼
API de pricing ──► Agent Mistral Studio
    │                    │
    │                    ├── recherche des comparables
    │                    ├── calcul du spread et de la valorisation
    │                    └── contrôles indépendants
    │
    ├── PostgreSQL (accès applicatif en lecture seule)
    ├── courbe swap EUR 6M par date
    └── audit vers audit@cdc.hackathon
```

Les identifiants PostgreSQL restent dans l’environnement d’exécution du service, jamais dans les instructions de l’agent. Si le traitement s’exécute dans le cloud Mistral, prévoir un worker ou un service dans un environnement autorisé qui accède à la base sans l’exposer publiquement. Les workflows Mistral peuvent orchestrer plusieurs étapes et du code exécuté dans votre environnement ; vérifier le mode de déploiement et les accès réseau avant de retenir cette option.

## Fichiers à créer

Structure de départ proposée, à adapter aux conventions du dépôt :

```text
PricerExMachina/
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

| Fichier | Responsabilité |
|---|---|
| `README.md` | Installation, configuration, lancement, déploiement, limites et exemples de requêtes. |
| `pyproject.toml` | Dépendances et outils de test et de formatage : SDK Mistral, pilote PostgreSQL, validation de schémas et solveur numérique si nécessaire. |
| `.env.example` | Noms des paramètres attendus, sans valeurs secrètes : `MISTRAL_API_KEY`, `DATABASE_URL` et configuration du service de courriel. |
| `Dockerfile` | Exécution reproductible du service ou du worker, selon le déploiement retenu. |
| `app/schemas.py` | Schémas validés de la demande et de la réponse : devise, émetteur, secteur, rating, séniorité, maturité, coupon, dates d’observation et caractéristiques optionnelles (call, label ESG, etc.). |
| `app/main.py` | Point d’entrée HTTP : valide la demande, appelle le traitement et renvoie la réponse structurée. |
| `app/agent.py` | Configuration de l’agent Mistral, de ses instructions et des outils auxquels il a accès. |
| `app/tools.py` | Outils bornés tels que `find_comparables` et `price_bond`. L’agent choisit ces opérations, mais ne construit pas de SQL. |
| `app/repository.py` | Accès PostgreSQL en lecture seule avec requêtes paramétrées. Centralise le mapping du schéma réel vers les objets métier. |
| `app/peer_selection.py` | Règles de comparabilité, exclusions, règles de repli et pondération des titres. |
| `app/valuation.py` | Calculs déterministes : flux de trésorerie, interpolation de courbe, estimation du spread et calcul du prix et du yield. |
| `app/supervisor.py` | Contrôles indépendants : unités, qualité et nombre de comparables, données manquantes, limites métier et cohérence des résultats. |
| `app/audit.py` | Création de la trace et envoi à la boîte d’audit ; doit signaler explicitement tout échec d’envoi. |
| `migrations/001_pricing_audit.sql` | Table d’audit seulement si aucune table adaptée n’existe. Ne pas recréer les tables de marché fournies. |
| `tests/` | Tests ciblés sur la sélection, la valorisation et les cas de données insuffisantes. |

## Étapes dans Mistral Studio

1. Ouvrir [Mistral Studio](https://console.mistral.ai/home), choisir le workspace autorisé et créer une clé API dédiée à l’application.
2. Stocker cette clé dans le gestionnaire de secrets de l’environnement d’exécution. Ne pas la committer ni l’inscrire dans les journaux.
3. Créer/configurer un agent, par exemple **Bond Pricing Assistant**, et choisir un modèle disponible dans le workspace en accord avec les règles de confidentialité de l’organisation.
4. Ajouter les instructions métier ci-dessous. L’agent doit demander les informations indispensables qui manquent, appeler les outils applicatifs et restituer séparément les résultats des deux dates.
5. Connecter les outils de `app/tools.py`. L’accès à PostgreSQL reste dans le backend ou le worker, avec des permissions limitées.
6. Utiliser un workflow si le parcours doit enchaîner des étapes contrôlées : analyse de la demande, recherche des comparables, calcul, supervision et audit.
7. Tester chaque étape dans Studio avant de déployer le worker ou l’application.

Les noms et emplacements des menus Studio pouvant évoluer, suivre l’interface disponible dans le workspace. Consulter la documentation actuelle de [Mistral Studio](https://docs.mistral.ai/studio), des [agents](https://docs.mistral.ai/studio/agents/agents-api), des [outils personnalisés](https://docs.mistral.ai/studio/agents/capabilities/tools) et des [workflows](https://docs.mistral.ai/studio/workflows/overview).

### Instructions métier proposées pour l’agent

> Tu aides à analyser une demande de pricing obligataire. Demande les caractéristiques indispensables manquantes. Utilise uniquement les outils disponibles pour rechercher les comparables et obtenir les calculs. Ne fabrique jamais de données, de prix, de courbe ou de comparable. Présente séparément chaque date d’observation. Décris les critères appliqués, les règles de repli, les titres effectivement utilisés et les limites de l’estimation. Si les données sont insuffisantes ou si le contrôle échoue, indique qu’aucune estimation robuste ne peut être fournie et demande une revue humaine. Ne prétends pas qu’un audit a été envoyé si le service d’audit ne le confirme pas.

## Sélection des comparables

Traiter chaque date d’observation indépendamment et conserver les critères appliqués dans la trace.

1. **Filtres stricts :** date, devise, disponibilité d’un prix de marché valide et caractéristiques obligataires compatibles.
2. **Proximité de crédit :** émetteur en priorité, puis secteur et rating selon une hiérarchie documentée.
3. **Structure :** séniorité, maturité, coupon et options (call, put), en tenant compte des caractéristiques atypiques.
4. **Règles de repli :** si le panel est trop petit, relâcher les critères dans un ordre défini et signaler chaque relâchement à l’utilisateur.
5. **Classement et pondération :** appliquer une méthode reproductible, par exemple une pondération selon la proximité de maturité et de rating. Éviter qu’un seul titre atypique domine l’estimation.

Pour chaque titre retenu, conserver son identifiant, sa date, ses données utiles, son spread source et son poids. Si aucun panel suffisamment pertinent n’est disponible, retourner « estimation non robuste » ou demander une validation humaine plutôt que produire un chiffre trompeur.

## Calcul et résultat

Pour chaque date :

1. Charger la courbe swap EUR 6M de cette date et vérifier qu’elle couvre les échéances requises.
2. Calculer ou récupérer les spreads des comparables selon la convention de marché retenue.
3. Estimer le Z-spread de l’obligation cible avec une méthode déterministe documentée, par exemple une médiane pondérée, et exposer les hypothèses et ajustements.
4. Reconstituer les flux de l’obligation cible et les valoriser avec la courbe et le spread estimé, selon les conventions retenues : calendrier, day count, fréquence de coupon et intérêts courus.
5. Calculer le yield comme le taux actuariel correspondant au prix obtenu. Le yield n’est pas nécessairement égal au taux swap à maturité plus le Z-spread. Cette somme peut être présentée comme approximation indicative, mais le calcul de yield doit préciser sa méthode.

Ne pas réutiliser pour une date les prix ou la courbe de l’autre date sans justification.

### Format de réponse recommandé

```json
{
  "obligation": {
    "issuer": "...",
    "currency": "EUR"
  },
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

Les zéros illustrent uniquement le format : ils ne doivent pas servir de valeur de remplacement. Si les données nécessaires manquent, retourner un statut d’échec explicite ou une réponse indiquant que le calcul n’a pas pu être fait.

## Supervision, audit et tests

Le superviseur vérifie des conditions mesurables : les comparables existent bien dans les données renvoyées par la base, la date et les devises concordent, la courbe est disponible, le calcul est réalisable et les règles métier sont respectées. Il peut refuser un résultat ou demander une revue humaine ; il ne valide pas une estimation uniquement parce que sa formulation paraît convaincante.

La trace destinée à `audit@cdc.hackathon` doit contenir la demande structurée, les filtres appliqués, les identifiants des comparables, les sources et dates des données, la méthode de calcul, les avertissements, les contrôles du superviseur et le statut réel de l’envoi. Exclure les secrets et les données non nécessaires.

Tester les trois situations du besoin :

- beaucoup de comparables disponibles ;
- peu de points, mais un univers permettant de trouver facilement des comparables ;
- aucun point pour l’émetteur, peu de titres ou d’émetteurs proches, et caractéristiques atypiques.

Tester également une courbe incomplète, des données manquantes, un panel vide et un échec d’envoi d’audit. Une perte d’information ne doit pas produire silencieusement une valorisation incohérente.

## Pré-requis et sécurité

Avant le développement, documenter le schéma PostgreSQL, les conventions de marché, la source des courbes et le format des deux jeux de données. Le compte PostgreSQL doit être en lecture seule sur les tables de marché et limité aux données nécessaires. Valider les règles de confidentialité applicables aux données envoyées au modèle, les accès réseau et la conservation des journaux.

**Critère de mise en service :** aucun prix ou spread n’est présenté comme robuste sans comparables identifiables, données de courbe compatibles, conventions explicites et contrôles réussis.
