# Guide de création d’un agent de pricing d’obligations

> **Sources et limite :** ce guide s’appuie sur le besoin du hackathon, le PDF [SIGMA-Presentation-Mistral](../FinanceCalculatorBackend/Hackathon/SIGMA-Presentation-Mistral.pdf) et la documentation Mistral Studio. Le PDF `studio-demo-deck-mna-walkthrough-FR.pdf` n’a pas pu être lu dans cette session ; ses étapes propres ne sont donc pas reprises.

## Objectif

Construire un agent qui évalue une nouvelle obligation à partir de titres comparables du marché secondaire conservés dans PostgreSQL. Pour chacune des deux dates d’observation, l’outil doit restituer :

- le Z-spread estimé et le yield indicatif ;
- le prix théorique, si les données nécessaires sont disponibles ;
- les obligations comparables retenues et les critères de sélection ;
- une explication traçable de la méthode, des hypothèses et des limites.

Le modèle Mistral interprète la demande et orchestre des outils. Le code applicatif sélectionne les comparables et exécute les calculs financiers déterministes. Le modèle ne doit ni inventer de données ni exécuter des requêtes SQL libres.

## Architecture cible

```text
Utilisateur ──► Interface Streamlit ──► API FastAPI
                                          │
                     ┌────────────────────┼──────────────────────┐
                     ▼                    ▼                      ▼
             PostgreSQL read-only   sélection sklearn   courbe QuantLib
                                          │                    │
                                          └──── NumPy/SciPy ───┘
                                                       │
                                                       ▼
                                             résultat + audit SMTP

Endpoint facultatif /api/assistant ──► Mistral (explication du résultat, sans recalcul)
```

Les identifiants PostgreSQL restent dans l’environnement d’exécution du service, jamais dans les instructions de l’agent. Si le traitement s’exécute dans le cloud Mistral, prévoir un worker ou un service dans un environnement autorisé qui accède à la base sans l’exposer publiquement. Les workflows Mistral peuvent orchestrer plusieurs étapes et du code exécuté dans votre environnement ; vérifier le mode de déploiement et les accès réseau avant de retenir cette option.

## Fichiers à créer

Structure actuellement implémentée :

```text
PricerExMachina/
├── README.md
├── pyproject.toml
├── requirements.txt
├── .env.example
├── app/
│   ├── main.py
│   ├── importer.py
│   ├── agent.py
│   ├── repository.py
│   ├── peer_selection.py
│   ├── pricing.py
│   ├── valuation.py
│   ├── audit.py
│   └── __init__.py
├── streamlit_app.py
├── guide-agent-pricing-obligations.md
└── tests/
    ├── test_api.py
    ├── test_audit.py
    ├── test_importer.py
    ├── test_pricing.py
    └── test_repository.py
```

| Fichier | Responsabilité |
|---|---|
| `README.md` | Installation, configuration, lancement, limites, endpoints et exemples de requêtes. |
| `pyproject.toml` et `requirements.txt` | Dépendances de l’API, de l’interface, des calculs QuantLib/NumPy/SciPy et scikit-learn, de l’import Excel, de l’audit Mailpit et des tests. |
| `.env.example` | Noms des paramètres attendus, sans valeurs secrètes : `MISTRAL_API_KEY`, `DATABASE_URL`, SMTP et Mailpit. |
| `app/main.py` | API FastAPI : valide la demande, appelle le traitement, expose la prévisualisation Excel et l’état Mailpit ; Uvicorn sert l’application. |
| `app/importer.py` | Prévisualisation et validation en lecture seule des classeurs avec openpyxl ; aucune écriture automatique en base. |
| `app/agent.py` | Explication facultative via Mistral des résultats déterministes ; le modèle n’accède pas à la base et ne calcule pas les prix. |
| `app/repository.py` | Accès PostgreSQL en lecture seule avec requêtes paramétrées. Centralise le mapping du schéma réel vers les objets métier. |
| `app/peer_selection.py` | Filtres stricts puis classement des comparables par plus proches voisins avec scikit-learn. |
| `app/pricing.py` | Validation de la requête et coordination du calcul indépendant pour chaque date. |
| `app/valuation.py` | QuantLib pour la courbe zéro et l’actualisation, NumPy pour les flux, SciPy pour résoudre le yield. |
| `app/audit.py` | Envoi SMTP de la trace et lecture des métadonnées Mailpit en environnement de développement. |
| `streamlit_app.py` | Interface de saisie, affichage des résultats et graphiques matplotlib. |
| `tests/` | Tests pytest de l’API, de l’import, de l’audit, de la sélection et de la valorisation. |

## Workflow Studio inspiré de la présentation SIGMA

La présentation montre un workflow composé de quatre étapes : collecte, analyses parallèles, score, puis approbation humaine (HITL). Elle insiste aussi sur l’évaluation par scores détaillés et sur la traçabilité des versions de prompts. Pour le pricing obligataire, adapter ce modèle ainsi :

1. **Recevoir et valider la demande** : extraire les caractéristiques de l’obligation et demander les champs indispensables absents.
2. **Collecter les données** : appeler les outils applicatifs en lecture seule pour récupérer les observations officielles et la courbe correspondante.
3. **Contrôler en parallèle** : faire examiner séparément la qualité des données, la pertinence des comparables et la cohérence des conventions/flux. Ces vérifications peuvent être parallèles ; la valeur numérique du spread et du prix doit toujours provenir du calcul déterministe, pas d’une moyenne des réponses de modèles.
4. **Évaluer et faire valider** : vérifier les seuils métier et soumettre les dossiers complexes, incomplets ou contradictoires à une revue humaine avant toute décision d’investissement.

Créer le workflow dans la section **Workflows** de Mistral Studio, et conserver les instructions de l’agent dans **Prompts** avec une version identifiable. Dans **Évaluations**, constituer un jeu de cas de référence couvrant les cas simples, intermédiaires et complexes ; noter séparément la qualité du panel, l’écart de spread/prix et le respect des avertissements. Enregistrer la version du prompt et les résultats de chaque évaluation. Ne pas traiter le score de 68 % illustré dans la présentation comme un seuil de fiabilité applicable au pricing : calibrer tout seuil sur des cas historiques évalués par des experts et demander une revue humaine en l’absence de calibration.

**État du code actuel :** l’API et l’interface réalisent le calcul déterministe ; l’appel Mistral facultatif explique un résultat déjà calculé. Le workflow Studio, les agents de contrôle parallèles et l’étape HITL ne sont pas provisionnés ni déployés par le code actuel. Ils doivent être créés et évalués dans le workspace autorisé avant d’annoncer cette orchestration comme opérationnelle.

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
