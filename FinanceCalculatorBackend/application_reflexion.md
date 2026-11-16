

Cas d'usage :
Déterminer le pricing d'une obligation à partir d'un panel d'obligations comparables et de l'obligation offrant le meilleur taux de rendement.
Produits Obligations cotées
**Cas d’usage sur le pricing des obligations :**

* La Caisse des Dépôts évalue régulièrement de nouvelles opportunités d'investissement obligataire :
* Pour estimer le prix d'une obligation, elle recherche des obligations comparables dont le prix est connu (niveau de risque, durée, caractéristiques financières)
* Principe similaire à l'estimation immobilière par biens comparables
* Méthode particulièrement utile pour les obligations non liquides, dont le prix n'est pas directement observable sur le marché

L'objectif : concevoir un agent IA capable de déterminer le prix d'une obligation en constituant un panel de titres comparables issus d'une base officielle, puis en en déduisant un prix d'équivalence.
01 - **Analyser la demande.** À partir d'une demande de pricing formulée par un utilisateur, l'agent analyse la requête et extrait les informations pertinentes (données structurées) nécessaires à la constitution du panel.
02 - **Constituer le panel.** Sur la base de ces caractéristiques, l'agent constitue un panel à partir d'une base officielle en identifiant les obligations « comparables » à celle dont le pricing est demandé.
03 - **Déterminer le prix.** À partir de ce panel, l'agent détermine un prix d'équivalence pour l'obligation.
04 - **Tracer & restituer.** L'agent documente ses choix de constitution du panel et les données utilisées, puis informe l'utilisateur des traitements réalisés.
**Cas pratiques :** trois obligations doivent être pricées.

* **Cas simple** — de nombreux points de courbe de taux ou de spread.
* **Cas intermédiaire** — peu de points, mais un univers d'investissement permettant de trouver facilement des obligations comparables.
* **Cas complexe** — aucun point de courbe pour l'émetteur, peu ou pas de courbes pour les émetteurs comparables et très peu de titres comparables. Les caractéristiques de l'obligation à pricer sont très spécifiques et peu communes (ex : label ESG, call peu commun).



Pour ce cas d'usage de pricing obligataire, l'agent IA doit reproduire le raisonnement d'un analyste crédit en recherchant les obligations les plus proches du titre à valoriser, puis en calculant une valeur théorique à partir des rendements observés.

Objectif métier

Déterminer le prix théorique d'une obligation peu ou non liquide à partir :

d'un panel d'obligations comparables ;
de leur prix de marché ;
de leur rendement actuariel (YTM) ;
de leurs caractéristiques financières et de risque.

Le résultat doit être justifié, traçable et auditable.

Architecture de l'agent IA
Étape 1 : Analyse de la demande
Entrée utilisateur

Exemple :

"Peux-tu valoriser l'obligation EDF 2034 coupon 3,75 % ?"

ou

"Détermine le prix de cette obligation senior unsecured BBB+ échéance 2032."

Extraction automatique des caractéristiques

L'agent extrait :

Critère	Exemple
ISIN	FR001400ABC
Émetteur	EDF
Secteur	Utilities
Notation	BBB+
Devise	EUR
Coupon	3,75 %
Type	Fixed Rate
Séniorité	Senior Unsecured
Date de maturité	15/07/2034
Option Call	Oui / Non
Label ESG	Oui / Non
Rang réglementaire	Senior, Tier 2, AT1
Sortie structurée
JSON
{
"issuer": "EDF",
"rating": "BBB+",
"sector": "Utilities",
"currency": "EUR",
"coupon": 3.75,
"maturity_year": 2034,
"seniority": "Senior Unsecured",
"esg": false
}
Étape 2 : Construction du panel comparable
Sources officielles

L'agent interroge :

Bloomberg BVAL
Refinitiv
Euronext
Tradeweb
MarketAxess
ICE Data Services
Banque Centrale Européenne (CSDB)
SIX Financial Information
Moteur de similarité

Chaque obligation reçoit un score de proximité.

Critères principaux
Critère	Pondération
Notation crédit	30 %
Secteur	20 %
Maturité	20 %
Séniorité	15 %
Devise	10 %
ESG / Options	5 %
Exemple

Obligation à valoriser :

Critère	Valeur
Secteur	Utilities
Rating	BBB+
Maturité	8 ans

Panel retenu :

Obligation	Score
EDF 2033	98
ENGIE 2034	95
ENEL 2034	93
Iberdrola 2035	91
RWE 2033	90
Étape 3 : Détermination du spread théorique

L'approche recommandée consiste à travailler en spread plutôt qu'en prix.

Calcul du spread moyen observé

Exemple :

Obligation	Yield
EDF 2033	4,20 %
ENGIE 2034	4,25 %
ENEL 2034	4,30 %
Iberdrola 2035	4,35 %

Yield moyen :

Plain Text
4,275 %
Identification du meilleur rendement

L'agent détecte automatiquement :

Obligation	Yield
EDF 2033	4,20 %
ENGIE 2034	4,25 %
ENEL 2034	4,30 %
Iberdrola 2035	4,35 %

Meilleur rendement :

Plain Text
Iberdrola 2035 = 4,35 %

Cette obligation peut servir :

de borne haute ;
de référence prudente ;
de benchmark complémentaire.
Étape 4 : Conversion Yield → Prix

À partir du rendement théorique obtenu :

Exemple :

Plain Text
Coupon = 3,75 %
Yield théorique = 4,275 %
Maturité restante = 8 ans
Nominal = 100

Calcul :

Plain Text
Prix théorique = VA des coupons

+ VA du remboursement final

Résultat :

Plain Text
96,42 %

soit :

Plain Text
964 200 €
pour un nominal de 1 M€
Cas simple
Contexte

Émetteur très actif.

Exemple :

EDF
TotalEnergies
SNCF
Crédit Agricole

Disponibilité :

nombreuses obligations
courbe de spread complète
Méthode

Interpolation directe.

Plain Text
Pricing = fonction courbe de spread

Précision :

Plain Text
Très élevée
Cas intermédiaire
Contexte

Peu de titres de l'émetteur.

Exemple :

foncière
ETI cotée
banque régionale
Méthode

Recherche :

même secteur
même rating
même maturité

Puis régression :

Plain Text
Spread = f(rating, duration, sector)
Cas complexe
Contexte

Très peu de comparables.

Exemples :

obligation verte spécifique
callable exotique
émission privée
infrastructure non cotée
Méthode multicouche
Niveau 1

Comparables directs.

Niveau 2

Comparables sectoriels.

Niveau 3

Comparables de notation.

Niveau 4

Facteurs de correction.

Exemple :

Plain Text
Spread BBB+ utilities = 180 bp
Prime ESG = -10 bp
Prime call exotique = +25 bp
 
Spread ajusté = 195 bp
 
Restitution attendue de l'agent

L'agent doit produire un rapport d'audit :

Obligation valorisée
ISIN
Émetteur
Coupon
Maturité
Comparables retenus
Obligation	Score	Yield
EDF 2033	98	4,20 %
ENGIE 2034	95	4,25 %
ENEL 2034	93	4,30 %
Comparables rejetés
Obligation	Motif
AT1 Banco Santander	Séniorité différente
High Yield Telecom	Rating incompatible
Calculs
Spread moyen
Ajustements appliqués
Yield retenu
Prix final
Résultat
Plain Text
Prix théorique : 96,42
 
Intervalle de confiance :
95,80 - 97,10
 
Obligation offrant le meilleur rendement :
Iberdrola 2035 à 4,35 %
 
Niveau de confiance :
87 %
Technologies IA recommandées
LLM : GPT-4o / GPT-5 pour l'analyse de la demande et l'explication.
Moteur de similarité : embeddings + vector search (Azure AI Search, Elasticsearch, Pinecone).
Pricing : Python (QuantLib, SciPy, Pandas).
Traçabilité : RAG avec stockage des comparables et justification des calculs.
Sources de marché : Bloomberg BVAL, ICE, Refinitiv, Tradeweb, MarketAxess.

Cette approche répond aux trois scénarios (simple, intermédiaire et complexe) tout en fournissant un pricing explicable et conforme aux exigences d'audit d'un investisseur institutionnel comme la Caisse des Dépôts.

Formaliser le workflow détaillé
Créer un schéma d’architecture
Proposer un prototype Python

===================================================

Pour ce cas d'usage de pricing obligataire, l'agent IA doit reproduire le raisonnement d'un analyste crédit en recherchant les obligations les plus proches du titre à valoriser, puis en calculant une valeur théorique à partir des rendements observés.

Objectif métier

Déterminer le prix théorique d'une obligation peu ou non liquide à partir :

d'un panel d'obligations comparables ;
de leur prix de marché ;
de leur rendement actuariel (YTM) ;
de leurs caractéristiques financières et de risque.

Le résultat doit être justifié, traçable et auditable.

Architecture de l'agent IA
Étape 1 : Analyse de la demande
Entrée utilisateur

Exemple :

"Peux-tu valoriser l'obligation EDF 2034 coupon 3,75 % ?"

ou

"Détermine le prix de cette obligation senior unsecured BBB+ échéance 2032."

Extraction automatique des caractéristiques

L'agent extrait :

Critère	Exemple
ISIN	FR001400ABC
Émetteur	EDF
Secteur	Utilities
Notation	BBB+
Devise	EUR
Coupon	3,75 %
Type	Fixed Rate
Séniorité	Senior Unsecured
Date de maturité	15/07/2034
Option Call	Oui / Non
Label ESG	Oui / Non
Rang réglementaire	Senior, Tier 2, AT1
Sortie structurée
JSON
{
"issuer": "EDF",
"rating": "BBB+",
"sector": "Utilities",
"currency": "EUR",
"coupon": 3.75,
"maturity_year": 2034,
"seniority": "Senior Unsecured",
"esg": false
}
Étape 2 : Construction du panel comparable
Sources officielles

L'agent interroge :

Bloomberg BVAL
Refinitiv
Euronext
Tradeweb
MarketAxess
ICE Data Services
Banque Centrale Européenne (CSDB)
SIX Financial Information
Moteur de similarité

Chaque obligation reçoit un score de proximité.

Critères principaux
Critère	Pondération
Notation crédit	30 %
Secteur	20 %
Maturité	20 %
Séniorité	15 %
Devise	10 %
ESG / Options	5 %
Exemple

Obligation à valoriser :

Critère	Valeur
Secteur	Utilities
Rating	BBB+
Maturité	8 ans

Panel retenu :

Obligation	Score
EDF 2033	98
ENGIE 2034	95
ENEL 2034	93
Iberdrola 2035	91
RWE 2033	90
Étape 3 : Détermination du spread théorique

L'approche recommandée consiste à travailler en spread plutôt qu'en prix.

Calcul du spread moyen observé

Exemple :

Obligation	Yield
EDF 2033	4,20 %
ENGIE 2034	4,25 %
ENEL 2034	4,30 %
Iberdrola 2035	4,35 %

Yield moyen :

Plain Text
4,275 %
Identification du meilleur rendement

L'agent détecte automatiquement :

Obligation	Yield
EDF 2033	4,20 %
ENGIE 2034	4,25 %
ENEL 2034	4,30 %
Iberdrola 2035	4,35 %

Meilleur rendement :

Plain Text
Iberdrola 2035 = 4,35 %

Cette obligation peut servir :

de borne haute ;
de référence prudente ;
de benchmark complémentaire.
Étape 4 : Conversion Yield → Prix

À partir du rendement théorique obtenu :

Exemple :

Plain Text
Coupon = 3,75 %
Yield théorique = 4,275 %
Maturité restante = 8 ans
Nominal = 100

Calcul :

Plain Text
Prix théorique = VA des coupons

+ VA du remboursement final

Résultat :

Plain Text
96,42 %

soit :

Plain Text
964 200 €
pour un nominal de 1 M€
Cas simple
Contexte

Émetteur très actif.

Exemple :

EDF
TotalEnergies
SNCF
Crédit Agricole

Disponibilité :

nombreuses obligations
courbe de spread complète
Méthode

Interpolation directe.

Plain Text
Pricing = fonction courbe de spread

Précision :

Plain Text
Très élevée
Cas intermédiaire
Contexte

Peu de titres de l'émetteur.

Exemple :

foncière
ETI cotée
banque régionale
Méthode

Recherche :

même secteur
même rating
même maturité

Puis régression :

Plain Text
Spread = f(rating, duration, sector)
Cas complexe
Contexte

Très peu de comparables.

Exemples :

obligation verte spécifique
callable exotique
émission privée
infrastructure non cotée
Méthode multicouche
Niveau 1

Comparables directs.

Niveau 2

Comparables sectoriels.

Niveau 3

Comparables de notation.

Niveau 4

Facteurs de correction.

Exemple :

Plain Text
Spread BBB+ utilities = 180 bp
Prime ESG = -10 bp
Prime call exotique = +25 bp
 
Spread ajusté = 195 bp
 
Restitution attendue de l'agent

L'agent doit produire un rapport d'audit :

Obligation valorisée
ISIN
Émetteur
Coupon
Maturité
Comparables retenus
Obligation	Score	Yield
EDF 2033	98	4,20 %
ENGIE 2034	95	4,25 %
ENEL 2034	93	4,30 %
Comparables rejetés
Obligation	Motif
AT1 Banco Santander	Séniorité différente
High Yield Telecom	Rating incompatible
Calculs
Spread moyen
Ajustements appliqués
Yield retenu
Prix final
Résultat
Plain Text
Prix théorique : 96,42
 
Intervalle de confiance :
95,80 - 97,10
 
Obligation offrant le meilleur rendement :
Iberdrola 2035 à 4,35 %
 
Niveau de confiance :
87 %
Technologies IA recommandées
LLM : GPT-4o / GPT-5 pour l'analyse de la demande et l'explication.
Moteur de similarité : embeddings + vector search (Azure AI Search, Elasticsearch, Pinecone).
Pricing : Python (QuantLib, SciPy, Pandas).
Traçabilité : RAG avec stockage des comparables et justification des calculs.
Sources de marché : Bloomberg BVAL, ICE, Refinitiv, Tradeweb, MarketAxess.

Cette approche répond aux trois scénarios (simple, intermédiaire et complexe) tout en fournissant un pricing explicable et conforme aux exigences d'audit d'un investisseur institutionnel comme la Caisse des Dépôts.

Formaliser le workflow détaillé
Workflow détaillé de l'agent IA de pricing obligataire
Vue d'ensemble
Plain Text
Demande utilisateur
│
▼

1. Analyse de la demande
   │
   ▼
2. Enrichissement des données de référence
   │
   ▼
3. Construction du panel comparable
   │
   ▼
4. Qualification et scoring des comparables
   │
   ▼
5. Détermination du spread théorique
   │
   ▼
6. Calcul du rendement cible
   │
   ▼
7. Calcul du prix théorique
   │
   ▼
8. Contrôles de cohérence
   │
   ▼
9. Documentation & traçabilité
   │
   ▼
   Restitution utilisateur
   Étape 1 : Analyse de la demande
   Objectif

Identifier précisément l'obligation à valoriser et les paramètres nécessaires au calcul.

Input

Requête utilisateur :

"Détermine le prix de l'obligation EDF 3,75% 2034"

Traitements IA

Extraction des attributs :

Attribut	Valeur
ISIN	si fourni
Émetteur	EDF
Coupon	3,75 %
Maturité	2034
Devise	EUR
Seniorité	Senior Unsecured
Call	Oui / Non
ESG	Oui / Non
Sortie
JSON
{
"issuer":"EDF",
"currency":"EUR",
"maturity":"2034-07-15",
"coupon":3.75,
"seniority":"Senior"
}
Gestion des erreurs

Si une donnée est absente :

interrogation de référentiels ;
recherche ISIN ;
demande de précision à l'utilisateur.
Étape 2 : Enrichissement des données
Objectif

Compléter automatiquement les caractéristiques de l'obligation.

Sources
Bloomberg
Refinitiv
ICE
SIX
Euronext
BCE CSDB
Données récupérées
Donnée	Utilité
Rating S&P	Risque
Rating Moody's	Risque
Secteur NACE	Comparabilité
Duration	Pricing
Z-Spread	Comparaison
OAS	Comparaison
Encours	Liquidité
Résultat

L'obligation est transformée en vecteur de caractéristiques.

Plain Text
EDF
BBB+
Utilities
EUR
Duration 7.9
Senior
ESG = Non
Étape 3 : Construction du panel brut
Objectif

Identifier un univers suffisamment large de comparables.

Filtres primaires
Devise
Plain Text
EUR uniquement
Type
Plain Text
Fixed Rate uniquement
Ranking
Plain Text
Senior Unsecured
Maturité
Plain Text
± 3 ans
Rating
Plain Text
BBB à A-
Exemple

Univers initial

Plain Text
3 500 obligations

Après filtrage

Plain Text
145 obligations
Étape 4 : Scoring des comparables
Objectif

Classer les obligations les plus proches.

Score de proximité
Plain Text
Score Global
============

30% Rating
+
25% Sector
+
20% Duration
+
15% Seniority
+
10% ESG/Options
Exemple
Obligation	Score
EDF 2033	98
ENGIE 2034	96
ENEL 2034	94
RWE 2035	92
IBERDROLA 2035	91
Seuils
Score	Statut

> 95	Comparable direct
> 85-95	Comparable pertinent
> 75-85	Comparable étendu
> <75	Rejet
> Étape 5 : Qualification du panel
> Objectif

Vérifier la qualité financière des comparables.

Contrôles
Liquidité minimale
Plain Text
Volume quotidien > seuil
Fair Value
Plain Text
BVAL disponible
Dernière cotation
Plain Text
< 5 jours
 
Absence d'événement exceptionnel
downgrade récent
restructuration
défaut
OPA
Résultat

Panel final

Plain Text
10 à 25 obligations
Étape 6 : Détermination du spread théorique
Méthode principale

Comparaison du spread.

Données utilisées
Obligation	Z-Spread
EDF 2033	145 bp
ENGIE 2034	148 bp
ENEL 2034	152 bp
RWE 2035	150 bp
Iberdrola 2035	155 bp
Pondération
Plain Text
Spread Théorique
 
==

Σ(Spread × Score)
 
/
Σ(Score)

Résultat :

Plain Text
150 bp
Étape 7 : Recherche du meilleur rendement
Objectif

Identifier la référence la plus attractive du panel.

Exemple
Obligation	Yield
EDF 2033	4.10%
ENGIE 2034	4.20%
ENEL 2034	4.28%
Iberdrola 2035	4.35%
Résultat
Plain Text
Best Yield
 
Iberdrola 2035
 
Yield = 4.35%

Utilisation :

borne haute ;
stress test ;
vérification de cohérence.
Étape 8 : Détermination du rendement cible
Cas simple

Courbe existante.

Plain Text
Yield cible
===========

Interpolation
Cas intermédiaire
Plain Text
Yield cible
===========

Spread théorique
+
Taux sans risque
Cas complexe

Modèle multicritères :

Plain Text
Yield
=====

Courbe secteur
+
Prime rating
+
Prime ESG
+
Prime call
+
Prime liquidité

Exemple :

Plain Text
Swap EUR 8 ans : 2,10 %
 
Prime crédit : +1,50 %
 
Prime ESG : -0,05 %
 
Prime call : +0,15 %
 
Yield cible
 
==

3,70 %
Étape 9 : Calcul du prix théorique
Inputs
Plain Text
Coupon : 3,75 %
 
Yield : 3,70 %
 
Maturité : 8 ans
Calcul
Plain Text
Prix
 
==

Σ Flux actualisés
+
Valeur nominale actualisée

Formule :

Plain Text
P = Σ(C/(1+y)^t)
+
N/(1+y)^T
Résultat
Plain Text
Prix théorique
===============

100,34
Étape 10 : Contrôles de cohérence
Contrôle 1

Comparaison avec :

BVAL
CBBT
TRACE
Tradeweb
Contrôle 2

Écart maximal autorisé

Plain Text
±3 %
Contrôle 3

Positionnement dans le panel

Plain Text
Le prix doit rester cohérent
avec les titres adjacents
Étape 11 : Calcul du niveau de confiance
Facteurs
Critère	Pondération
Nombre de comparables	30%
Qualité données	25%
Proximité moyenne	25%
Liquidité marché	20%
Exemple
Plain Text
Nombre de comparables = 15
 
Score moyen = 93
 
Liquidité correcte
 
Confiance = 89%
Étape 12 : Génération du rapport de traçabilité
Obligatoire pour audit
Section 1

Obligation pricée

Plain Text
ISIN
Émetteur
Maturité
Coupon
Section 2

Panel retenu

Obligation	Score	Yield	Spread
EDF 2033	98	4.10	145
ENGIE 2034	96	4.20	148
ENEL 2034	94	4.28	152
Section 3

Comparables rejetés

Titre	Motif
AT1 Santander	Seniorité
Telecom HY	Rating
Section 4

Calculs réalisés

méthode sélectionnée ;
pondérations ;
ajustements ;
interpolation éventuelle ;
corrections ESG/call.
Section 5

Décision finale

Plain Text
Prix Théorique : 100,34
 
Yield retenu : 3,70 %
 
Spread retenu : 150 bp
 
Meilleur rendement observé :
Iberdrola 2035 à 4,35 %
 
Indice de confiance :
89 %
 
Gestion des 3 cas d'usage
Étape	Cas simple	Cas intermédiaire	Cas complexe
Courbe émetteur	Disponible	Partielle	Absente
Comparables	Nombreux	Quelques-uns	Très rares
Méthode	Interpolation	Comparables pondérés	Modèle hybride
IA	Assistance	Forte contribution	Contribution majeure
Niveau confiance	>90%	75-90%	50-75%

Ce workflow est directement implémentable sous forme d'un système Agentic AI + RAG + moteur quantitatif (QuantLib/Python) avec des agents spécialisés : Agent Analyse, Agent Market Data, Agent Comparable Finder, Agent Pricing Engine, Agent Explainability et Agent Audit & Compliance.

Ajouter les règles de gestion des exceptions
Transformer ce workflow en diagramme BPMN
Créer une checklist d’implémentation
=======================================

Workflow détaillé de l'agent IA de pricing obligataire
Vue d'ensemble
Plain Text
Demande utilisateur
│
▼

1. Analyse de la demande
   │
   ▼
2. Enrichissement des données de référence
   │
   ▼
3. Construction du panel comparable
   │
   ▼
4. Qualification et scoring des comparables
   │
   ▼
5. Détermination du spread théorique
   │
   ▼
6. Calcul du rendement cible
   │
   ▼
7. Calcul du prix théorique
   │
   ▼
8. Contrôles de cohérence
   │
   ▼
9. Documentation & traçabilité
   │
   ▼
   Restitution utilisateur
   Étape 1 : Analyse de la demande
   Objectif

Identifier précisément l'obligation à valoriser et les paramètres nécessaires au calcul.

Input

Requête utilisateur :

"Détermine le prix de l'obligation EDF 3,75% 2034"

Traitements IA

Extraction des attributs :

Attribut	Valeur
ISIN	si fourni
Émetteur	EDF
Coupon	3,75 %
Maturité	2034
Devise	EUR
Seniorité	Senior Unsecured
Call	Oui / Non
ESG	Oui / Non
Sortie
JSON
{
"issuer":"EDF",
"currency":"EUR",
"maturity":"2034-07-15",
"coupon":3.75,
"seniority":"Senior"
}
Gestion des erreurs

Si une donnée est absente :

interrogation de référentiels ;
recherche ISIN ;
demande de précision à l'utilisateur.
Étape 2 : Enrichissement des données
Objectif

Compléter automatiquement les caractéristiques de l'obligation.

Sources
Bloomberg
Refinitiv
ICE
SIX
Euronext
BCE CSDB
Données récupérées
Donnée	Utilité
Rating S&P	Risque
Rating Moody's	Risque
Secteur NACE	Comparabilité
Duration	Pricing
Z-Spread	Comparaison
OAS	Comparaison
Encours	Liquidité
Résultat

L'obligation est transformée en vecteur de caractéristiques.

Plain Text
EDF
BBB+
Utilities
EUR
Duration 7.9
Senior
ESG = Non
Étape 3 : Construction du panel brut
Objectif

Identifier un univers suffisamment large de comparables.

Filtres primaires
Devise
Plain Text
EUR uniquement
Type
Plain Text
Fixed Rate uniquement
Ranking
Plain Text
Senior Unsecured
Maturité
Plain Text
± 3 ans
Rating
Plain Text
BBB à A-
Exemple

Univers initial

Plain Text
3 500 obligations

Après filtrage

Plain Text
145 obligations
Étape 4 : Scoring des comparables
Objectif

Classer les obligations les plus proches.

Score de proximité
Plain Text
Score Global
============

30% Rating
+
25% Sector
+
20% Duration
+
15% Seniority
+
10% ESG/Options
Exemple
Obligation	Score
EDF 2033	98
ENGIE 2034	96
ENEL 2034	94
RWE 2035	92
IBERDROLA 2035	91
Seuils
Score	Statut

> 95	Comparable direct
> 85-95	Comparable pertinent
> 75-85	Comparable étendu
> <75	Rejet
> Étape 5 : Qualification du panel
> Objectif

Vérifier la qualité financière des comparables.

Contrôles
Liquidité minimale
Plain Text
Volume quotidien > seuil
Fair Value
Plain Text
BVAL disponible
Dernière cotation
Plain Text
< 5 jours
 
Absence d'événement exceptionnel
downgrade récent
restructuration
défaut
OPA
Résultat

Panel final

Plain Text
10 à 25 obligations
Étape 6 : Détermination du spread théorique
Méthode principale

Comparaison du spread.

Données utilisées
Obligation	Z-Spread
EDF 2033	145 bp
ENGIE 2034	148 bp
ENEL 2034	152 bp
RWE 2035	150 bp
Iberdrola 2035	155 bp
Pondération
Plain Text
Spread Théorique
 
==

Σ(Spread × Score)
 
/
Σ(Score)

Résultat :

Plain Text
150 bp
Étape 7 : Recherche du meilleur rendement
Objectif

Identifier la référence la plus attractive du panel.

Exemple
Obligation	Yield
EDF 2033	4.10%
ENGIE 2034	4.20%
ENEL 2034	4.28%
Iberdrola 2035	4.35%
Résultat
Plain Text
Best Yield
 
Iberdrola 2035
 
Yield = 4.35%

Utilisation :

borne haute ;
stress test ;
vérification de cohérence.
Étape 8 : Détermination du rendement cible
Cas simple

Courbe existante.

Plain Text
Yield cible
===========

Interpolation
Cas intermédiaire
Plain Text
Yield cible
===========

Spread théorique
+
Taux sans risque
Cas complexe

Modèle multicritères :

Plain Text
Yield
=====

Courbe secteur
+
Prime rating
+
Prime ESG
+
Prime call
+
Prime liquidité

Exemple :

Plain Text
Swap EUR 8 ans : 2,10 %
 
Prime crédit : +1,50 %
 
Prime ESG : -0,05 %
 
Prime call : +0,15 %
 
Yield cible
 
==

3,70 %
Étape 9 : Calcul du prix théorique
Inputs
Plain Text
Coupon : 3,75 %
 
Yield : 3,70 %
 
Maturité : 8 ans
Calcul
Plain Text
Prix
 
==

Σ Flux actualisés
+
Valeur nominale actualisée

Formule :

Plain Text
P = Σ(C/(1+y)^t)
+
N/(1+y)^T
Résultat
Plain Text
Prix théorique
===============

100,34
Étape 10 : Contrôles de cohérence
Contrôle 1

Comparaison avec :

BVAL
CBBT
TRACE
Tradeweb
Contrôle 2

Écart maximal autorisé

Plain Text
±3 %
Contrôle 3

Positionnement dans le panel

Plain Text
Le prix doit rester cohérent
avec les titres adjacents
Étape 11 : Calcul du niveau de confiance
Facteurs
Critère	Pondération
Nombre de comparables	30%
Qualité données	25%
Proximité moyenne	25%
Liquidité marché	20%
Exemple
Plain Text
Nombre de comparables = 15
 
Score moyen = 93
 
Liquidité correcte
 
Confiance = 89%
Étape 12 : Génération du rapport de traçabilité
Obligatoire pour audit
Section 1

Obligation pricée

Plain Text
ISIN
Émetteur
Maturité
Coupon
Section 2

Panel retenu

Obligation	Score	Yield	Spread
EDF 2033	98	4.10	145
ENGIE 2034	96	4.20	148
ENEL 2034	94	4.28	152
Section 3

Comparables rejetés

Titre	Motif
AT1 Santander	Seniorité
Telecom HY	Rating
Section 4

Calculs réalisés

méthode sélectionnée ;
pondérations ;
ajustements ;
interpolation éventuelle ;
corrections ESG/call.
Section 5

Décision finale

Plain Text
Prix Théorique : 100,34
 
Yield retenu : 3,70 %
 
Spread retenu : 150 bp
 
Meilleur rendement observé :
Iberdrola 2035 à 4,35 %
 
Indice de confiance :
89 %
 
Gestion des 3 cas d'usage
Étape	Cas simple	Cas intermédiaire	Cas complexe
Courbe émetteur	Disponible	Partielle	Absente
Comparables	Nombreux	Quelques-uns	Très rares
Méthode	Interpolation	Comparables pondérés	Modèle hybride
IA	Assistance	Forte contribution	Contribution majeure
Niveau confiance	>90%	75-90%	50-75%

Ce workflow est directement implémentable sous forme d'un système Agentic AI + RAG + moteur quantitatif (QuantLib/Python) avec des agents spécialisés : Agent Analyse, Agent Market Data, Agent Comparable Finder, Agent Pricing Engine, Agent Explainability et Agent Audit & Compliance.

Ajouter les règles de gestion des exceptions
Extension du workflow : Gestion des exceptions et cas dégradés

Dans un contexte institutionnel (CDC, assureur, asset manager), la valeur ajoutée de l'agent ne réside pas uniquement dans le calcul du prix mais surtout dans sa capacité à gérer les situations où les données sont incomplètes, incohérentes ou inexistantes.

Architecture de gestion des exceptions
Plain Text
Collecte de données
│
▼
Contrôle qualité
│
├── Aucune anomalie
│ │
│ ▼
│ Workflow nominal
│
└── Anomalie détectée
│
▼
Moteur de règles
│
┌───────┼────────┐
▼ ▼ ▼
Auto- Escalade
correction humaine Blocage
Règle E01 : Obligation introuvable
Cas

L'utilisateur demande :

Plain Text
Valoriser FRXXXXXXXXXX

mais aucun référentiel ne contient l'ISIN.

Détection
Plain Text
0 résultat Bloomberg
0 résultat Refinitiv
0 résultat BCE
Action
Niveau 1

Recherche par :

Nom émetteur
Coupon
Maturité
Niveau 2

Recherche fuzzy

Plain Text
EDF 3.75 2034

au lieu de

Plain Text
FR001999999
Niveau 3

Escalade utilisateur

Plain Text
Impossible d'identifier le titre.
Merci de fournir un ISIN valide ou
des caractéristiques supplémentaires.
Décision
Plain Text
Statut = REJET
 
Règle E02 : Données obligataires incomplètes
Cas

Titre identifié mais :

Plain Text
Rating absent

ou

Plain Text
Coupon absent
Action

Priorité des sources :

Plain Text
Bloomberg
↓
Refinitiv
↓
ICE
↓
BCE
 
Si toujours absent

Substitution :

Rating

Utilisation du rating émetteur.

Exemple :

Plain Text
EDF bond sans notation
 
=> Rating EDF
Coupon

Recherche dans :

Prospectus
EMTN Program
Documentation AMF
Décision
Plain Text
Pricing autorisé
Donnée remplacée
Tag = ESTIMATED
Règle E03 : Absence de prix de marché
Cas

Obligation très peu liquide.

Aucune transaction récente.

Plain Text
Dernier trade > 30 jours
Action

L'agent bascule automatiquement :

Mode nominal
Plain Text
Prix observable
 

vers

Mode modèle
Plain Text
Comparable Pricing Model
Trace
Plain Text
Motif :
Absence de prix de marché récent
Règle E04 : Panel insuffisant
Cas

Moins de 3 comparables.

Exemple :

Plain Text
Obligation verte notée BBB+
2039

Aucun comparable exact.

Action

Élargissement progressif

Niveau 1

Maturité

Plain Text
±3 ans

passe à

Plain Text
±5 ans
Niveau 2

Notation

Plain Text
BBB+

devient

Plain Text
BBB à A-
Niveau 3

Secteur

Plain Text
Utilities françaises

devient

Plain Text
Utilities européennes
Limite
Plain Text
Panel minimal = 5 titres
Si impossible
Plain Text
Confiance faible
Escalade
Règle E05 : Comparables incohérents
Cas

Un comparable génère une anomalie.

Exemple :

Obligation	Yield
EDF	4.2%
ENGIE	4.1%
ENEL	4.3%
XYZ	8.9%
Détection

Méthode :

Plain Text
Z-score

ou

Plain Text
IQR
Action

Outlier détecté

Plain Text
Comparables exclus
Trace
Plain Text
Motif :
Yield hors distribution
Règle E06 : Conflit entre fournisseurs de données
Cas

Prix observés différents.

Source	Prix
Bloomberg	97.2
Refinitiv	95.8
ICE	97.4
Détection
Plain Text
Ecart > 1%
 
Traitement

Calcul :

Plain Text
Médiane
 

ou

Plain Text
VWAP si disponible
Résultat
Plain Text
Prix retenu : 97.2
Trace

Fournisseurs utilisés :

Plain Text
Bloomberg
ICE
Refinitiv
Règle E07 : Courbe émetteur inexistante
Cas

Aucune obligation liquide de l'émetteur.

Exemple :

Plain Text
PME cotée

ou

Plain Text
SPV Infrastructure
Action

Substitution :

Plain Text
Courbe sectorielle
Plain Text
Ajustement notation
Exemple
Plain Text
Utilities BBB+
 
spread moyen : 160 bp
Trace
Plain Text
Pricing indirect
Règle E08 : Obligation avec option complexe
Cas

Produit :

Callable
Make Whole Call
Puttable
Step-up
Perpétuelle
Action

Moteur quantitatif spécialisé.

Calcul :

Plain Text
OAS

au lieu de

Plain Text
YTM
 
Contrôle

Si modèle indisponible :

Plain Text
Escalade expert crédit
Règle E09 : Obligation ESG atypique
Cas

Très peu de comparables.

Exemple :

Plain Text
Green Bond
Social Bond
Sustainability-linked Bond
Action

Recherche :

Plain Text
Greenium

sectoriel.

Exemple
Plain Text
Prime ESG observée :
 
-5 bp
Si données insuffisantes
Plain Text
Prime ESG = 0

mais documentée.

Règle E10 : Résultat hors marché
Cas

Prix calculé :

Plain Text
114

alors que le panel se situe :

Plain Text
95 à 102
Détection
Plain Text
Prix hors intervalle statistique
Actions

Recalcul automatique :

vérification des cashflows ;
vérification du coupon ;
vérification de la maturité ;
vérification du spread.
Si persistance
Plain Text
Escalade analyste
Règle E11 : Niveau de confiance insuffisant
Calcul
Plain Text
Confidence Score

basé sur :

Critère	Poids
Nb comparables	30%
Similarité moyenne	25%
Qualité des données	25%
Liquidité marché	20%
Seuils
Score	Action

> 85	Validation automatique
> 70 - 85	Validation assistée
> 50 - 70	Revue analyste
> < 50	Rejet automatique
> Règle E12 : Auditabilité impossible
> Cas

Impossible de reconstituer :

données utilisées ;
calculs ;
comparables.
Action

Blocage immédiat.

Plain Text
Pricing non conforme
Motif
Plain Text
Violation exigences d'audit
Matrice synthétique de gestion des exceptions
Code	Exception	Action automatique	Escalade
E01	Obligation introuvable	Recherche élargie	Oui
E02	Données manquantes	Enrichissement	Non
E03	Pas de prix marché	Modèle comparable	Non
E04	Panel insuffisant	Élargissement	Oui
E05	Outlier	Exclusion	Non
E06	Conflit fournisseurs	Médiane/VWAP	Non
E07	Courbe absente	Courbe sectorielle	Non
E08	Option exotique	OAS	Oui
E09	ESG atypique	Greenium	Non
E10	Résultat aberrant	Recalcul	Oui
E11	Confiance faible	Blocage/Revue	Oui
E12	Audit impossible	Rejet	Oui
Workflow de décision final
Plain Text
Pricing demandé
│
▼
Données disponibles ?
│
┌────┴────┐
│ │
Oui Non
│ │
▼ ▼
Panel Enrichissement
│
▼
5 comparables minimum ?
│
┌────┴─────┐
│ │
Oui Non
│ │
▼ ▼
Pricing Extension univers
│
▼
Confiance > 70 ?
│
┌────┴─────┐
│ │
Oui Non
│ │
▼ ▼
Validation Revue analyste
│
▼
Rapport d'audit
│
▼
Publication du prix

Ces règles permettent à l'agent de rester robuste, explicable, conforme aux exigences d'audit et utilisable sur les cas simples, intermédiaires et complexes, y compris lorsque les données de marché sont dégradées ou incomplètes.

Ajouter les seuils et délais d’escalade
Formaliser la matrice RACI
Créer les règles en pseudo-code
=================================

1. Seuils opérationnels et délais d'escalade

L'objectif est d'éviter qu'un agent IA produise un prix non fiable sans intervention humaine tout en maximisant l'automatisation.

Matrice des seuils de contrôle
Contrôle	Seuil	Action automatique	Escalade
Nombre de comparables	≥ 10	Pricing automatique	Non
Nombre de comparables	5 à 9	Pricing avec alerte	Non
Nombre de comparables	< 5	Blocage	Oui
Similarité moyenne panel	≥ 90 %	Pricing automatique	Non
Similarité moyenne panel	80-90 %	Pricing assisté	Non
Similarité moyenne panel	< 80 %	Blocage	Oui
Écart max fournisseurs	< 1 %	Conservation données	Non
Écart max fournisseurs	1-3 %	Médiane/VWAP	Non
Écart max fournisseurs	> 3 %	Revue humaine	Oui
Dernière cotation	< 5 jours	Utilisation directe	Non
Dernière cotation	5-30 jours	Décote liquidité	Non
Dernière cotation	> 30 jours	Pricing modèle	Oui
Confidence Score	> 85	Validation automatique	Non
Confidence Score	70-85	Validation superviseur	Oui
Confidence Score	50-70	Revue analyste crédit	Oui
Confidence Score	< 50	Rejet automatique	Oui
Écart prix calculé / marché	< 2 %	Acceptation	Non
Écart prix calculé / marché	2-5 %	Contrôle renforcé	Oui
Écart prix calculé / marché	> 5 %	Blocage	Oui
SLA d'escalade
Niveau 1 - Escalade automatique

Cas :

données manquantes ;
panel faible ;
conflit fournisseurs.

Délai :

Plain Text
< 30 secondes

Destinataire :

Plain Text
Agent de supervision IA
Niveau 2 - Escalade analyste crédit

Cas :

moins de 5 comparables ;
émetteur sans courbe ;
obligation atypique.

Délai :

Plain Text
< 15 minutes

Destinataire :

Plain Text
Analyste Crédit Front Office
Niveau 3 - Escalade expert produit

Cas :

callable complexe ;
perpetual ;
hybride ;
dette subordonnée.

Délai :

Plain Text
< 1 heure

Destinataire :

Plain Text
Expert Obligataire Senior
Niveau 4 - Escalade Risk Management

Cas :

écart > 5 % avec marché ;
pricing contesté ;
valorisation impactant NAV.

Délai :

Plain Text
< 4 heures

Destinataire :

Plain Text
Market Risk Officer
Niveau 5 - Escalade Compliance/Audit

Cas :

données non traçables ;
impossibilité de reconstituer le calcul ;
utilisation de données non autorisées.

Délai :

Plain Text
Immédiat

Destinataire :

Plain Text
Conformité + Audit interne
2. Matrice RACI
Processus complet de pricing obligataire
Activité	IA Pricing	Analyste Crédit	Expert Produit	Risk Manager	Compliance
Analyse de la demande	R	A	I	I	I
Recherche des données	R	A	I	I	I
Construction panel	R	A	I	I	I
Détection anomalies	R	A	I	C	I
Calcul spread	R	A	C	I	I
Calcul prix	R	A	C	I	I
Contrôle qualité	R	A	C	C	I
Validation standard	R	A	I	I	I
Validation complexe	C	R	A	I	I
Validation risque	I	C	C	A	I
Validation conformité	I	I	I	C	A
Archivage	R	A	I	I	C
Auditabilité	R	C	I	I	A
Légende
Lettre	Rôle
R	Responsible
A	Accountable
C	Consulted
I	Informed
3. Pseudo-code métier complet
Contrôles préliminaires
Plain Text
FUNCTION ValidateRequest(Bond)
 
IF Bond == NULL
RETURN REJECT
 
IF ISIN NOT FOUND
RETURN ESCALATE_E01
 
IF Coupon IS NULL
RetrieveCoupon()
 
IF Rating IS NULL
RetrieveIssuerRating()
 
IF Currency IS NULL
RETURN ESCALATE_E02
 
RETURN VALID
Construction du panel
Plain Text
FUNCTION BuildComparablePanel(Bond)
 
Panel = SearchComparableBonds()
 
Panel = FilterByCurrency(Panel)
Panel = FilterBySeniority(Panel)
Panel = FilterByMaturity(Panel)
Panel = FilterByRating(Panel)
 
IF COUNT(Panel) < 5
Panel = ExtendSearchUniverse()
 
IF COUNT(Panel) < 5
RETURN ESCALATE_E04
 
RETURN Panel
Détection des outliers
Plain Text
FUNCTION RemoveOutliers(Panel)
 
FOR EACH Bond IN Panel
 
YieldDeviation =
ABS(Bond.Yield - AverageYield)
 
IF YieldDeviation >
2 * StandardDeviation
 
MarkAsOutlier(Bond)
 
REMOVE Outliers
 
RETURN Panel
 
Contrôle qualité des données
Plain Text
FUNCTION DataQualityCheck(Panel)
 
FOR EACH Bond IN Panel
 
IF LastTradeDate > 30 Days
 
MarkAsIlliquid(Bond)
 
IF SourceConflict > 3%
 
RETURN ESCALATE_E06
 
RETURN OK
Calcul du score de proximité
Plain Text
FUNCTION SimilarityScore(Bond)
 
Score =
 
30% RatingScore
+
25% SectorScore
+
20% DurationScore
+
15% SeniorityScore
+
10% ESGScore
 
RETURN Score
Vérification minimale du panel
Plain Text
FUNCTION ValidatePanel(Panel)
 
AvgSimilarity =
Average(Score)
 
IF AvgSimilarity < 80
 
RETURN ESCALATE_E04
 
IF Count(Panel) < 5
 
RETURN ESCALATE_E04
 
RETURN VALID
Calcul du spread cible
Plain Text
FUNCTION ComputeTargetSpread(Panel)
 
WeightedSpread =
 
SUM(
Spread × SimilarityScore
)
 
/
 
SUM(
SimilarityScore
)
 
RETURN WeightedSpread
Recherche du meilleur rendement
Plain Text
FUNCTION GetBestYield(Panel)
 
BestBond = MAX(Yield)
 
RETURN BestBond
Calcul du prix
Plain Text
FUNCTION PriceBond(Bond)
 
YieldTarget =
ComputeTargetYield()
 
Price =
DiscountedCashFlows(
Coupon,
YieldTarget,
Maturity
)
 
RETURN Price
Contrôle de cohérence marché
Plain Text
FUNCTION MarketSanityCheck(
CalculatedPrice,
MarketPrices
)
 
Deviation =
 
ABS(
CalculatedPrice
---------------

MedianMarketPrice
)
 
IF Deviation > 5%
 
RETURN ESCALATE_E10
 
IF Deviation > 2%
 
RETURN REVIEW_REQUIRED
 
RETURN OK
Calcul du Confidence Score
Plain Text
FUNCTION ComputeConfidence()
 
Confidence =
 
30% ComparableCountScore
+
25% SimilarityScore
+
25% DataQualityScore
+
20% LiquidityScore
 
RETURN Confidence
Décision finale
Plain Text
FUNCTION FinalDecision()
 
Confidence =
ComputeConfidence()
 
IF Confidence > 85
RETURN APPROVED
 
IF Confidence >= 70
RETURN SUPERVISOR_APPROVAL
 
IF Confidence >= 50
RETURN ANALYST_REVIEW
 
RETURN REJECTED
4. Règles métier exécutables (format type moteur de règles)
Plain Text
RULE R001
IF ComparableCount < 5
THEN EscalateToAnalyst
 
RULE R002
IF SimilarityScore < 80
THEN EscalateToAnalyst
 
RULE R003
IF SourceConflict > 3%
THEN EscalateToRisk
 
RULE R004
IF LastTradeDate > 30 Days
THEN UseModelPricing
 
RULE R005
IF ConfidenceScore < 50
THEN RejectPricing
 
RULE R006
IF PricingDeviation > 5%
THEN BlockAndEscalate
 
RULE R007
IF ComplexOption = TRUE
THEN EscalateToProductExpert
 
RULE R008
IF AuditTrailMissing = TRUE
THEN RejectPricing
 
RULE R009
IF ESGComparableCount < 3
THEN RemoveESGPremium
 
RULE R010
IF IssuerCurveMissing = TRUE
THEN UseSectorCurve
5. Workflow cible de gouvernance
Plain Text
Demande
│
▼
Analyse IA
│
▼
Construction Panel
│
▼
Contrôles Qualité
│
┌───────────────┴───────────────┐
│ │
Conforme Anomalie
│ │
▼ ▼
Calcul Prix Moteur Exceptions
│ │
▼ ▼
Confidence > 85 ? Escalade N1/N2/N3
│
┌────┴────┐
│ │
Oui Non
│ │
▼ ▼
Validation Revue humaine
auto obligatoire
│
▼
Publication
│
▼
Archivage + Audit Trail

Cette version est suffisamment détaillée pour être traduite directement en BPMN, en Azure AI Foundry (multi-agents), en LangGraph, Semantic Kernel ou dans un moteur de règles de type Drools, IBM ODM, FICO Blaze Advisor ou Azure Logic Apps.

Rendre les règles compatibles avec Drools
Ajouter les cas limites et exceptions
Transformer le workflow en BPMN

================================================================================================

Cas limites et exceptions avancées

Pour un processus de valorisation obligataire destiné à la CDC, aux assureurs ou aux asset managers, les cas les plus risqués ne sont pas les obligations standards mais les situations où le modèle risque de produire un prix artificiellement précis sur des données dégradées.

CL01 - Obligation nouvellement émise (New Issue)
Symptôme

L'obligation a été émise récemment.

Plain Text
Age émission < 10 jours

Exemple :

Plain Text
Nouveau Green Bond EDF 2040

Aucun historique.

Risque

Le pricing est basé sur :

bookbuilding ;
marché primaire ;
indications de syndication.
Règle
Plain Text
IF BondAge < 10 Days
THEN
Use Primary Market Spread
Confidence -20%
Escalade
Plain Text
Validation Front Office obligatoire
CL02 - Downgrade récent
Symptôme

L'émetteur a subi :

Plain Text
Downgrade < 30 jours

Exemple :

Plain Text
BBB+ → BBB
Risque

Les rendements historiques deviennent obsolètes.

Règle
Plain Text
IF RatingChangeDate < 30 Days
THEN
Exclude Historical Curve
Rebuild Panel
CL03 - Upgrade récent

Même logique.

Le spread historique est trop pessimiste.

Plain Text
IF UpgradeDate < 30 Days
THEN
Apply Transition Adjustment
CL04 - Obligation en défaut
Symptôme
Plain Text
Default Event = TRUE

ou

Plain Text
Distressed Debt
Règle
Plain Text
IF Default = TRUE
THEN
Pricing Mode = Recovery

Plus de valorisation actuarielle classique.

CL05 - Obligation proche maturité
Symptôme
Plain Text
Residual Maturity < 3 mois
Risque

Durée très faible.

Le comparatif courbe devient peu pertinent.

Règle
Plain Text
IF RemainingMaturity < 90 Days
THEN
Use Money Market Pricing
CL06 - Obligation perpétuelle
Symptôme
Plain Text
Maturity = NULL

ou

Plain Text
Perpetual = TRUE
Règle
Plain Text
IF Perpetual = TRUE
THEN
Use OAS Model
Escalate Product Expert
CL07 - Callable proche de la date d'exercice
Symptôme
Plain Text
NextCallDate < 12 mois
Risque

Le prix dépend davantage du comportement de l'émetteur que de la maturité finale.

Règle
Plain Text
IF TimeToCall < 12 Months
THEN
Price on Call Date
CL08 - Changement majeur de marché
Événements
hausse BCE > 100 bp ;
crise bancaire ;
choc souverain ;
pandémie ;
guerre.
Règle
Plain Text
IF MarketStress = TRUE
THEN
Reduce Historical Lookback
CL09 - Obligations ESG sans comparable
Symptôme
Plain Text
ESGComparableCount = 0
Règle
Plain Text
Remove Greenium

car aucune preuve observée.

CL10 - Courbe inversée
Symptôme
Plain Text
Yield(10Y) < Yield(5Y)
Risque

Interpolation classique incorrecte.

Règle
Plain Text
Use Spline Interpolation
CL11 - Liquidité extrêmement faible
Symptôme
Plain Text
Last Trade > 90 jours
Décote
Délai	Décote liquidité
30-60 j	10 bp
60-90 j	20 bp

> 90 j	50 bp
> CL12 - Concentration excessive du panel
> Cas

90 % des comparables proviennent du même émetteur.

Plain Text
EDF
EDF
EDF
EDF
EDF
Règle
Plain Text
Issuer Weight <= 25%
CL13 - Concentration géographique
Cas

Tous les comparables :

Plain Text
France uniquement
 
Règle
Plain Text
Country Concentration <= 50%
CL14 - Obligation hybride bancaire
Cas
Plain Text
AT1
Tier2
RT1
CoCo Bonds
Règle
Plain Text
Standard Pricing Forbidden
CL15 - Événement corporate exceptionnel
Exemples
OPA
Fusion
Spin-off
Nationalisation
Règle
Plain Text
IF CorporateActionDate < 90 Days
THEN
Review Required
Complément de gouvernance
Classification des incidents
Niveau	Description	Traitement
P1	Risque financier majeur	Blocage immédiat
P2	Risque valorisation	Escalade expert
P3	Données incomplètes	Correction automatique
P4	Anomalie mineure	Journalisation
BPMN cible
Version métier
Plain Text
╔══════════════════════════════════════╗
║ DEMANDE DE PRICING OBLIGATAIRE ║
╚══════════════════════════════════════╝
│
▼
[Analyse demande]
│
▼
ISIN identifié ?
│
┌────┴────┐
│ │
Oui Non
│ │
│ [Recherche élargie]
│ │
│ ▼
│ Trouvé ?
│
└──────► Non
│
▼
[REJET]
Phase d'enrichissement
Plain Text
[Chargement Référentiels]
│
▼
[Données complètes ?]
│
┌──────┴─────┐
│ │
Oui Non
│ │
▼ ▼
Workflow Enrichissement
normal automatique
│
▼
Toujours incomplet ?
│
┌──────┴──────┐
│ │
Oui Non
│
▼
Escalade analyste
Construction du panel
Plain Text
[Recherche comparables]
│
▼
[Nombre >= 5 ?]
│
┌─────┴─────┐
│ │
Oui Non
│ │
│ Elargir univers
│ │
▼ ▼

> = 5 ?
> │
> ┌────┴──────┐
> │ │
> Oui Non
> │
> ▼
> Escalade analyste
> Contrôles de cohérence
> Plain Text
> [Calcul Score Similarité]
> │
> ▼
> Score > 80 ?
> │
> ┌──────┴──────┐
> │ │
> Oui Non
> │ │
> ▼ ▼
> Continuer Escalade
> Calcul du prix
> Plain Text
> [Calcul Spread]
> │
> ▼
> [Calcul Yield]
> │
> ▼
> [Calcul Prix]
> │
> ▼
> [Contrôle Marché]
> │
> ▼
> Ecart < 5 % ?
> Décision finale
> Plain Text
> [Confidence Score]
> │
> ▼
> Score > 85 ?
> │
> ┌──────────┴──────────┐
> │ │
> Oui Non
> │ │
> ▼ ▼
> Validation Auto Revue Humaine
> │ │
> └──────────┬──────────┘
> ▼
> Rapport Audit
> │
> ▼
> Publication Prix
> │
> ▼
> Archivage 10 ans
> BPMN technique (prêt pour Camunda / Flowable)
> Diagramme Mermaid

Cette version est suffisamment détaillée pour être directement intégrée dans Camunda 8, Flowable, IBM BPM, Bizagi, BonitaSoft, Azure Logic Apps ou convertie en BPMN 2.0 XML exécutable, avec gestion des événements d'erreur, SLA d'escalade, timers, tâches humaines et règles métier DMN associées.

Générer le BPMN 2.0 XML exécutable
Ajouter les règles DMN associées
Créer une matrice des exceptions
=================================

Créer un schéma d’architecture et Proposer un prototype Python
Schéma d'architecture cible
L'architecture doit séparer clairement :

L'orchestration métier
La recherche de comparables
Le moteur de pricing
La gouvernance / audit
L'escalade humaine

┌─────────────────────────────────────────────────────┐
│                    Utilisateur                      │
│  Gérant - Analyste Crédit - Risk Manager           │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  API / Front-End                    │
│      Chat Copilot - Portail CDC - API REST         │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                Agent Orchestrateur                  │
│                                                     │
│ • Analyse requête                                  │
│ • Pilotage workflow BPMN                           │
│ • Gestion exceptions                               │
│ • Gestion escalades                                │
└──────┬─────────────┬───────────────┬────────────────┘
       │             │               │
       ▼             ▼               ▼

┌─────────────┐ ┌─────────────┐ ┌─────────────────┐
│ Agent Data │ │ Agent RAG   │ │ Agent Compliance│
│ Acquisition│ │ Comparable  │ │ & Governance    │
└──────┬──────┘ └──────┬──────┘ └─────────┬───────┘
       │               │                  │
       ▼               ▼                  ▼

┌─────────────────────────────────────────────────────┐
│                Market Data Layer                    │
│                                                     │
│ Bloomberg BVAL                                      │
│ Refinitiv                                           │
│ ICE Data Services                                   │
│ Euronext                                            │
│ MarketAxess                                         │
│ Tradeweb                                            │
│ BCE CSDB                                            │
│ SIX Financial Information                           │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼

┌─────────────────────────────────────────────────────┐
│            Similarity & Retrieval Engine            │
│                                                     │
│ Scoring Rating                                      │
│ Scoring Duration                                    │
│ Scoring ESG                                         │
│ Scoring Sector                                      │
│ Vector Search                                       │
│ Hybrid Search                                       │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼

┌─────────────────────────────────────────────────────┐
│                Pricing Engine                       │
│                                                     │
│ Yield Calculation                                   │
│ Spread Calculation                                  │
│ Yield Curve Interpolation                           │
│ OAS Engine                                          │
│ Expected Recovery                                   │
│ Liquidity Premium                                   │
│ Greenium Adjustment                                 │
│ QuantLib                                            │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼

┌─────────────────────────────────────────────────────┐
│               Decision Engine                       │
│                                                     │
│ Confidence Score                                    │
│ Validation Rules                                    │
│ Escalation Rules                                    │
│ Risk Controls                                       │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼

┌─────────────────────────────────────────────────────┐
│                Audit Repository                     │
│                                                     │
│ Panel retenu                                        │
│ Calculs                                             │
│ Versions modèles                                   │
│ Données de marché                                  │
│ Logs complets                                      │
└─────────────────────────────────────────────────────┘
Architecture logique Azure AI Foundry

Azure AI Foundry
       │
       ▼

Supervisor Agent
       │
 ┌─────┼──────┬─────────┬────────┐
 ▼     ▼      ▼         ▼        ▼

Request  Market  Comparable Risk  Audit
Agent    Agent   Agent      Agent Agent
                     │
                     ▼
              Azure AI Search
                     │
                     ▼
            Bond Comparable Index
                     │
                     ▼
                QuantLib Engine
Modèle de données minimal
Bond

@dataclass
class Bond:
    isin: str
    issuer: str
    rating: str
    sector: str
    coupon: float
    maturity: date
    seniority: str
    currency: str
    esg_label: bool
Comparable Bond

@dataclass
class ComparableBond:

    bond: Bond

    market_price: float

    yield_to_maturity: float

    spread: float

    liquidity_score: float

    similarity_score: float
Prototype Python - Version MVP
Structure projet

bond-pricer/

├── app.py
├── models.py
├── pricing.py
├── comparables.py
├── scoring.py
├── exceptions.py
├── confidence.py
├── config.yaml
└── sample_data.csv
models.py

from dataclasses import dataclass
from datetime import date

@dataclass
class Bond:

    isin: str
    issuer: str
    rating: str
    sector: str
    coupon: float
    maturity: date
    seniority: str
    currency: str
    esg_label: bool

scoring.py

from datetime import date

def similarity_score(target, comp):

    score = 0

    if target.rating == comp.rating:
        score += 30

    if target.sector == comp.sector:
        score += 25

    if target.seniority == comp.seniority:
        score += 15

    duration_gap = abs(
        (target.maturity -
         comp.maturity).days
    ) / 365

    score += max(0, 20 - duration_gap * 2)

    if target.currency == comp.currency:
        score += 10

    return round(score, 2)
comparables.py

def get_comparables(
    target_bond,
    universe
):

    result = []

    for bond in universe:

        score = similarity_score(
            target_bond,
            bond
        )

        if score > 75:

            bond.similarity_score = score

            result.append(bond)

    return sorted(
        result,
        key=lambda x:
        x.similarity_score,
        reverse=True
    )

pricing.py

import numpy as np

def weighted_spread(panel):

    num = sum(
        b.spread * b.similarity_score
        for b in panel
    )

    den = sum(
        b.similarity_score
        for b in panel
    )

    return num / den

def theoretical_yield(

    risk_free_rate,
    spread
):

    return (
        risk_free_rate +
        spread / 10000
    )

moteur de prix

def bond_price(

    coupon,

    ytm,

    years,

    nominal=100
):

    pv_coupon = 0

    for t in range(

        1,
        int(years) + 1

    ):

        pv_coupon += (

            coupon * nominal
        ) / ((1 + ytm) ** t)

    pv_nominal = (

        nominal /
        ((1 + ytm) ** years)

    )

    return round(
        pv_coupon +
        pv_nominal,
        2
    )

confidence.py

def confidence_score(

    nb_comparables,
    avg_similarity,
    data_quality,
    liquidity

):

    score = (

        0.30 * nb_comparables
        + 0.25 * avg_similarity
        + 0.25 * data_quality
        + 0.20 * liquidity

    )

    return score
Exemple d'exécution

spread = weighted_spread(panel)

ytm = theoretical_yield(

    risk_free_rate=0.025,

    spread=spread

)

price = bond_price(

    coupon=0.0375,

    ytm=ytm,

    years=8

)

print(price)
Évolutions V2 (Production)
Fonctions quantitatives
Remplacer les calculs manuels par :

QuantLib
pour :

courbe zéro coupon ;
OAS ;
callable bonds ;
interpolation spline ;
bootstrap de courbe.
Stockage

PostgreSQL
+
pgvector
pour :

historique pricing ;
panel utilisés ;
audit trail.
Recherche de comparables

Azure AI Search
ou

Elasticsearch

avec :

recherche hybride ;
vectorisation ;
scoring métier.
Moteur de règles

Drools
ou

DMN Camunda
pour exécuter automatiquement les règles R001 à R015, les cas limites CL01 à CL15 et les workflows d'escalade.

Cette architecture permet de passer d'un POC Python en quelques semaines à une plateforme industrielle de valorisation obligataire sous gouvernance CDC avec auditabilité complète, gestion des exceptions, BPMN exécutable et supervision humaine des cas complexes.

Ajouter les tests unitaires du prototype

Corriger le calcul du prix avec coupon fractionné

Créer une API FastAPI pour le pricing
Mettre en place la documentation OpenAPI pour l'API
Ajouter des endpoints pour :
    - Calcul du prix d'une obligation
    - Calcul du rendement théorique
    - Calcul du spread pondéré
    - Calcul du score de confiance

=================================================================================================================
