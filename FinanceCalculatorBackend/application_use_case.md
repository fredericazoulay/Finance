Verdict : partiellement. L’application couvre le parcours de base de pricing d’obligations cotées, mais pas tous les critères du cas #3. Je n’ai fait que lire le code et les tests; je n’ai rien modifié et n’ai pas exécuté les tests.

Écarts majeurs

Z-spread et deux dates : non intégrés au pricing par comparables. Le service choisit un comparable et actualise la cible à son YTM. Le calcul du Z-spread existe dans un endpoint distinct, qui exige un prix de marché et une courbe fournie par l’appelant; le parcours par panel ne produit pas de résultats pour deux dates ni de yield calculé depuis la courbe EUR swap 6M. Voir BondComparablesPricingService.java:48, BondAnalyticsService.java:38 et les exigences dans application_use_case.md:18.
Données officielles : disponibilité conditionnelle. L’import CSV/Excel et un adaptateur vers un fournisseur licencié existent, mais le fournisseur est désactivé tant que son URL n’est pas configurée. Les champs source et asOf restent déclaratifs et ne sont pas vérifiés indépendamment. Le CSV de démo porte des mentions « synthétique » et « non coté ». Voir README_API.md:248, application.properties:12 et Liste_obligations_light.csv:2.
Critères de comparabilité incomplets côté interface. Le backend peut classer selon l’émetteur, la notation, le secteur et la séniorité, mais le modèle et la requête construite par le frontend ne transmettent pas ces attributs de la cible. Le classement s’appuie donc essentiellement sur les autres critères disponibles. Voir bond-comparables.model.ts:56 et BondComparablesPricingRequest.java:11.
Audit et supervision : absents du parcours de pricing. L’application possède une extraction de cible par IA et une analyse conversationnelle, mais je n’ai trouvé ni envoi de compte rendu à audit@cdc.hackathon ni mécanisme de validation par un second agent, contrairement aux exigences application_use_case.md:43.
Instruments : prise en charge spécialisée non établie. Le périmètre annoncé est celui des obligations cotées. Le pricing par panel construit des flux à coupon fixe; les certificats de dépôt ne sont pas un type d’instrument dédié, et les coupons flottants ou clauses d’exercice ne sont pas traités dans ce calculateur. Leur représentation simplifiée comme obligation fixe ne couvrirait pas leurs caractéristiques spécifiques.
Ce qui est déjà couvert
La cible peut être saisie ou extraite d’une description; un panel peut être importé, recherché via un fournisseur configuré ou chargé comme démo. Le backend contrôle devise, échéance, date/provenance, exclut la cible elle-même et renvoie rangs, motifs de classement et raisons d’exclusion. Les tests couvrent notamment les données périmées, l’absence de comparable et le choix d’un titre plus similaire malgré un YTM inférieur : BondComparablesPricingServiceTest.java:59. Cela fournit un socle robuste, mais ne remplace pas les exigences de Z-spread, de deux dates et de traçabilité par e-mail.

À noter : « certificats de dépôt », actions et parts de fonds figurent dans les définitions générales du document; le périmètre du cas #3 indique toutefois « obligations cotées ».

Le Z-spread (Zero-Volatility Spread) est la marge constante qu'il faut ajouter à chaque point de la courbe des taux sans risque (courbe des taux zéro-coupon) pour que la somme des flux de trésorerie actualisés d'une obligation soit exactement égale à son prix de marché.
Contrairement au simple écart nominal ou au G-spread (qui utilisent un seul point de référence, comme la maturité), le Z-spread tient compte de toute la structure de la courbe des taux.

Formule mathématique

Le prix de marché P d'une obligation s'écrit par l'équation suivante :
\(P=\sum _{t=1}^{n}\frac{\text{CF}_{t}}{(1+r_{t}+Z)^{t}}\)
Où :
• \(\text{CF}_{t}\) : Flux de trésorerie (coupon ou remboursement du principal) versé à la période t.
• \(r_{t}\) : Taux zéro-coupon sans risque pour l'échéance t.
• Z : Le Z-spread recherché.
• t : Temps en années (ou nombre de périodes).

Comment le calculer ?

Comme il n'existe pas de formule explicite directe (forme fermée) pour isoler Z dans cette équation polynomiale de degré n, le calcul se fait par approximations successives (méthode itérative) :
1. Obtenir la courbe des taux zéro-coupon (courbe des spots sans risque, par exemple issue des emprunts d'État ou des taux OIS).
2. Recenser tous les flux futurs de l'obligation (\(\text{CF}_1, \text{CF}_2, \dots, \text{CF}_n\)).
3. Tester une valeur pour le Z-spread (Z).
4. Calculer la valeur actuelle de chaque flux en utilisant \((r_t + Z)\) comme taux d'actualisation et faire la somme.
5. Comparer la somme obtenue au prix de marché réel de l'obligation :
	• Si la somme est supérieure au prix de marché, il faut augmenter Z.
	• Si la somme est inférieure au prix de marché, il faut diminuer Z.
6. Répéter l'opération (via un solveur numérique comme la fonction Valeur cible d'Excel, un script Python/QuantLib, ou une calculatrice financière) jusqu'à ce que la valeur actualisée égale le prix de marché.

====================================================================================
https://www.investopedia.com/terms/z/zspread.asp

Definition
The zero-volatility spread (z-spread) is the constant spread that makes the price of a security equal to the present value of its cash flows when added to the yield at each point on the spot rate Treasury curve where cash flow is received.

Key Takeaways
The zero-volatility spread (Z-spread) quantifies the extra yield a bond must provide over a risk-free Treasury bond.
Unlike the nominal spread, the Z-spread accounts for the entire yield curve, helping evaluate bonds’ risk-return trade-offs more comprehensively.
A higher Z-spread points to greater credit risk, as investors demand more compensation for the perceived risk of holding a specific bond.
The Z-spread is crucial for analyzing mortgage-backed securities by evaluating yield over the entire yield curve for these complex securities.
Investors use the Z-spread to determine price discrepancies, optimizing portfolio value and risk-return balance.
Get personalized, AI-powered answers built on 27+ years of trusted expertise.

Ask anything to get started...
Ask anything to get started...


Type a message
How do yield spreads signal economic health and market sentiment?
When should i use zero-volatility spread (z-spread) for asset-backed securities?
How to calculate credit spread for corporate bonds versus treasury bonds?
How do yield spreads signal economic health and market sentiment?
When should i use zero-volatility spread (z-spread) for asset-backed securities?
How to calculate credit spread for corporate bonds versus treasury bonds?
The z-spread is the extra yield an investor requires over a comparable Treasury bond to account for the added risk of owning a bond. It helps investors measure credit risk and compare bonds with different risk and return levels. It can affect a bond’s price and signal changes in its risk, so knowing how z-spread works can help you make better choices and manage your portfolios more effectively.

Analyzing Insights from the Z-Spread
The z-spread is the constant spread that needs to be added to a benchmark yield curve to make the price of a bond equal to the present value of its cash flows. Below is a sample spread:


To understand this concept, let’s return to our job analogy. Suppose you took the stable government job, but your friend calls again asking you to move over to the startup. The z-spread is like calculating the extra compensation package (salary, bonuses, and benefits) the startup needs to offer each year, over your entire career, to make the risky move worthwhile.

In bond terms, the government job is the yield curve of risk-free Treasury securities. These government securities are considered risk-free since the U.S. government has always paid such debts. The startup job is analogous to the greater risk, but potentially higher reward, of the corporate or other non-government bond you’re considering. The z-spread gives you a measure of how much more in yield the riskier bond must offer at every point along its life cycle to match the value of the safe Treasury bonds.

Here are key aspects of the z-spread:

It’s a comprehensive measure: Unlike simpler spread calculations, the z-spread accounts for the entire yield curve, not just at a single point.
Quantifies your risk: It effectively measures the premium investors demand for taking on the additional risk of a non-Treasury security.
Present value comparison: The z-spread ensures that the present value of the bond’s cash flow, when discounted at the Treasury yield plus the spread, equals the bond’s market price.
Constant spread: The “zero-volatility” in the name of the spread refers to how the spread remains constant across all maturities of the yield curve.
Unlike the nominal spread, which uses a single point on the Treasury yield curve, the z-spread considers the full curve. The nominal spread calculates the spread at one point to match a bond’s cash flow value with its price.

Analysts use the z-spread to spot price discrepancies in bonds. It provides a realistic value by measuring the spread over the whole Treasury yield curve, unlike single-point metrics.

How to Calculate the Z-Spread Formula
To calculate a z-spread, an investor must take the Treasury spot rate at each relevant maturity, add the z-spread to this rate, and then use this combined rate as the discount rate to calculate the price of the bond. The formula to calculate a z-spread is as follows: 
P
=
C
1
(
1
+
r
1
+
Z
2
)
2
n
+
C
2
(
1
+
r
2
+
Z
2
)
2
n
+
C
n
(
1
+
r
n
+
Z
2
)
2
n
where:
P
=
Current price of the bond plus any accrued interest
C
x
=
Bond coupon payment
r
x
=
Spot rate at each maturity
Z
=
Z-spread
n
=
Relevant time period
​P=(1+2r1​+Z​)2nC1​​+(1+2r2​+Z​)2nC2​​+(1+2rn​+Z​)2nCn​​where:P=Current price of the bond plus any accrued interestCx​=Bond coupon paymentrx​=Spot rate at each maturityZ=Z-spreadn=Relevant time period​
Example
Assume a bond is currently priced at $104.90. It has three future cash flows: a $5 payment next year, a $5 payment two years from now, and a final total payment of $105 in three years. The Treasury spot rate at the one-, two-, and three-year marks are 2.5%, 2.7%, and 3%.
We need to find the z-spread that equates the bond price to the present value of these cash flows. Those cash flows are determined by discounting the two $5 cash flows and the final $105 payment to find their present value. This is done by dividing each cash flow by one plus the sum of the Treasury spot rate for that period (2.5%, 2.7%, and 3.0% in our example) and the z-spread, raised to the power of two times the number of the period:
$
104.90
=
 
$
5
(
1
+
2.5
%
+
Z
2
)
2
×
1
+
$
5
(
1
+
2.7
%
+
Z
2
)
2
×
2
+
$
105
(
1
+
3
%
+
Z
2
)
2
×
3
 $104.90=​ (1+22.5%+Z​)2×1$5​+(1+22.7%+Z​)2×2$5​+(1+23%+Z​)2×3$105​​
We can then calculate the net present value of the three cash flows:
4.8696 + 4.7176 + 95.3157 = 104.9029
Given that our bond price is $104.90 and the calculated present value of the cash flows is about $104.9029, we adjust the z-spread slightly to match the bond price exactly. In this case, the z-spread is found to be the following:
$140.9029 - 140.9000 = 0.0029, or 0.29%.


Why Is the Z-Spread Important for Mortgage-Backed Securities?
The z-spread is particularly useful for analyzing mortgage-backed securities (MBS) because it considers the spread across the entire yield curve, providing a clearer picture of the bond’s value. Given the complexity and varied cash flows of an MBS, the z-spread helps investors assess the true yield and risk by discounting each cash flow at the correct rate.

Can a Z-Spread Be Negative?
Yes, the z-spread on a bond can be negative if it’s trading at a premium compared with risk-free Treasury securities. This would indicate that investors are willing to accept a lower yield because of factors such as superior credit quality, higher liquidity, or other attractive bond features.

How Does the Z-Spread Help in Credit Risk Assessment?
The z-spread provides insights into the credit risk of a bond by comparing its yield to the risk-free Treasury yield curve. A higher z-spread indicates a higher perceived credit risk, as investors demand additional compensation for taking on that risk. Conversely, a lower z-spread suggests lower credit risk.

How Can the Z-Spread Help Bond Investors?
In bond portfolio management, the z-spread helps assess the relative value of different bonds. By comparing the z-spreads of various securities, investors can identify relatively undervalued or overvalued bonds, optimize the portfolio’s risk-return profile, and make more informed decisions about buying or selling bonds to achieve their investment objectives.

How Does the Z-Spread Differ From the Option-Adjusted Spread (OAS)?
The Z-spread measures the spread over the Treasury yield curve without considering any embedded options in the bond, such as call or put options (e.g., a convertible bond, a callable bond, or a putable bond). If present, the option-adjusted spread (OAS) adjusts for these options, providing a more accurate reflection of the bond’s true spread by accounting for the value of these options. Essentially, the OAS is the z-spread adjusted for option risk.

The Bottom Line
The z-spread is an important tool for assessing the relative value of bonds. It represents the constant spread that, when added to the Treasury spot rate at each cash flow point, equates the bond’s price to the present value of its cash flows.



Type	Definition	Features	Best Used For	Typical Users
Asset Swap Spread	Difference between bond yield and similar maturity swap rate	• Links bond and swap markets	• Comparing across markets
• Bonds with complex structures
• Hedging	• Fixed-income traders
• Hedge funds
• Risk managers
CDS Spread	Cost of insuring against default	• Direct measure of credit risk	• Assessing the perceived default risk	• Fixed-income analysts
• Credit analysts
• Portfolio managers
• Financial planners/advisors
G-Spread	The difference between the yield of a bond and the yield of a government bond of similar maturity.	• Often used in international markets
• Considers the yield of government bonds from the same country	• Comparing to current market conditions	• International bond investors
• Fixed-income analysts
• Traders
I-Spread	The difference between the yield of a bond and the swap rate of the same maturity.	• Commonly used in Europe
• Compares the bond's yield to the interbank swap rate
• Considers credit risk.	• When more precision than the G-spread is needed
• When the exact maturity match isn't available	• European bond investors
• Fixed-income Analysts
• Credit analysts
Nominal Spread	Difference between bond yield and benchmark Treasury yield	• Simple to calculate
• Doesn't account for the time value of money or cash flow structure	• Quick comparisons	• Retail investors
• Bond traders
• Financial planners/advisors
Option-Adjusted Spread	The spread added to the risk-free rate curve accounting for embedded options in bonds.	• Adjusts for options like call or put features
• Provides a more accurate risk assessment of callable bonds	• Analyzing callable or putable bonds	• Fixed-income analysts
• Credit analysts
• Portfolio managers
• Financial planners/advisors
TED Spread	The difference between the interest rates on interbank loans and short-term U.S. government debt.	
• Reflects credit risk in the banking sector
• A wider TED spread indicates higher perceived risk	• Analysis of credit markets by central banks and institutional investors	• Institutional investors
• Banks
• Central banks
• Regulators
• Market analysts
Yield Spread	General term for the difference in yield among different bonds	• Flexible: can compare various bonds	• Broad market comparisons	• All involved in bond trading
Z-Spread	Constant spread over entire Treasury spot rate curve	• Considers the entire yield curve
• Adjusts for the bond's cash flow structure	• Comprehensive evaluations of a bond value over time	• Fixed-income analysts
• Bond traders
• Institutional Investors
• Financial planners/advisors
• Credit analysts
• Portfolio managers




exemple chiffré pas à pas

Pour cet exemple, le Z-spread de l'obligation est d'environ 0,6025 % (soit 60,25 points de base). Cette marge constante permet de faire correspondre la somme actualisée de ses flux futurs à son prix de marché de 104,00 €.

1. Données de départ

Prenons une obligation d'entreprise avec les caractéristiques suivantes :
• Nominal et remboursement. 100 € remboursés in fine dans 3 ans.
• Coupon annuel. 5 % (soit 5 € versés chaque année).
• Prix de marché actuel. 104,00 €.
La courbe des taux sans risque zéro-coupon (spots) observée sur le marché est la suivante :
• Année 1 (r₁). 2,00 %.
• Année 2 (r₂). 2,50 %.
• Année 3 (r₃). 3,00 %.

2. Mise en équation

Nous cherchons la valeur unique Z qui vérifie l'égalité suivante :
\(104,00=\frac{5}{(1+0,02+Z)^{1}}+\frac{5}{(1+0,025+Z)^{2}}+\frac{105}{(1+0,03+Z)^{3}}\)

3. Résolution par approximations successives

Comme Z ne peut pas être isolé algébriquement, nous procédons par essais successifs en encadrant le prix cible de 104,00 €.

Année (t)	Flux (\(\text{CF}_{t}\))	Taux spot (\(r_{t}\))	Essai 1 (Z = 0,00%)	Essai 2 (Z = 1,00%)	Résultat exact (Z = 0,6025%)
1	5 €	2,00 %	4,9020 €	4,8544 €	4,8732 €
2	5 €	2,50 %	4,7591 €	4,6676 €	4,7036 €
3	105 €	3,00 %	96,0899 €	93,3446 €	94,4232 €
Total	—	—	105,7510 €	102,8666 €	104,0000 €

• Première étape (Z = 0,00%). En actualisant uniquement aux taux sans risque, la valeur obtenue est de 105,7510 €. Ce montant est supérieur au prix de marché (104,00 €), ce qui signifie que Z doit être positif.
• Deuxième étape (Z = 1,00%). En ajoutant une marge de 1 %, la valeur chute à 102,8666 €. Ce résultat passe sous le prix cible, donc Z se situe entre 0 % et 1 %.
• Convergence. Par interpolation numérique (via un solveur comme la fonction Valeur cible d'Excel ou la méthode de Brent), on obtient Z = 0,6025 %, qui ramène exactement la somme actualisée à 104,00 €.


====================================================================================

Détail du Cas #3 – Proposition de pricing d’une obligation à partir d’un panel :

Qu’est ce qu’une obligation ? C’est un titre de dette émis par un émetteur (État, entreprise, institution publique/financière) pour financer
ses activités. L’investisseur prête des fonds en échange d’un remboursement à échéance avec paiement d’intérêts (coupons).
Qu’est ce que le marché primaire ? Segment où les obligations sont émises pour la première fois et vendues par l’émetteur aux
investisseurs institutionnels. Par opposition au marché secondaire, segment où les titres déjà émis sont échangés entre investisseurs.
Qu’est ce que la table d’intermédiation ? C’est une équipe dédiée (distincte des équipes de gestion), qui traite les ordres sur les
marchés financiers en garantissant la meilleure exécution possible.
Comment se détermine le prix d’une (nouvelle) obligation ?
Approche par les comparables en identifiant des obligations existantes avec des caractéristiques similaires dans un panel : Rating de
l’émetteur (AAA, BB+, etc.) ; Durée (maturité : 2 ans, 10 ans, 30 ans) ; Type (taux fixe, variable, zéro-coupon) ; Secteur (souverain,
corporate, financials), Liquidité (spread bid/ask).

Front Office (gérant d’un portefeuille crédit) - Proposition de pricing d’une obligation à
partir d’un panel
Ce matin, la table d'intermédiation vous propose de participer à l'émission d’une nouvelle obligation sur le marché primaire. Avant de prendre une décision d'investissement, vous souhaitez déterminer la juste valeur (Fair Value) de cette obligation en les comparant aux titres déjà présents sur le marché secondaire pour comparer aux prix / taux proposés.
Délivrer un outil permettant d'évaluer rapidement si une nouvelle émission est attractive par rapport aux niveaux observés sur le marché secondaire
1. Création d’ un outil d'estimation du Z-spread des nouvelles obligations à chacune des deux dates d'observation où
 L'utilisateur renseigne leurs caractéristiques (par obligation) : émetteur, secteur, rating, maturité, rang de séniorité, devise, etc.).
 À partir des données de marché fournies, l'outil détermine le niveau de Z-spread théorique le plus pertinent pour chaque obligation.
2. Résultats attendus pour chaque nouvelle obligation et pour chacune des deux dates :
 Estimation du Z-spread
 Identification des obligations comparables utilisées dans le calcul
 Explication de la méthodologie retenue
 Calcul du yield à partir du Z-spread obtenu et de la courbe swap EUR 6M (considérée comme la courbe des taux sans risque)
 Critères de succès : l'outil doit produire une valorisation robuste, explicable et cohérente avec les comparables de marché. La
performance sera évaluée à la fois sur la précision des estimations et sur la qualité de la méthodologie proposée.

Deux jeux de données du marché obligataire vous sont fournis, correspondant à deux dates d'observation différentes

La mission : concevoir un agent IA capable de déterminer le prix d'une obligation en constituant un panel
de titres comparables issus d'une base officielle, puis en déduisant un prix d'équivalence.
01 Analyser la demande : à partir d'une demande de pricing formulée par un utilisateur, l'agent IA analyse la requête et extrait les informations pertinentes (données structurées) nécessaires à la recherche du panel.
02 Constituer le panel : sur la base de ces caractéristiques, l'agent IA filtre le panel pertinent à partir de la base officielle en identifiant les obligations « comparables » à celle dont le pricing est demandé.
03 Déterminer le prix : à partir de ce panel, l'agent IA détermine un prix d'équivalence pour l'obligation.
04 Tracer & restituer : l'agent IA documente ses choix de constitution du panel et les données utilisées, puis informe l'utilisateur des
traitements réalisés.
Cas pratique : pricing de plusieurs obligations par niveau de complexité
• Cas simple : de nombreux points de spread.
• Cas intermédiaire : peu de points, mais un univers d'investissement permettant de trouver facilement des obligations comparables.
• Cas complexe : aucun point de courbe pour l'émetteur, peu ou pas de courbes pour les émetteurs comparables et très peu de titres
comparables. Les caractéristiques de l'obligation à pricer sont très spécifiques et peu communes (ex : label ESG, call peu commun).
Traçabilité : l’agent doit expliquer son raisonnement et ses actions/conclusions par mail sur la boite audit@cdc.hackathon
Résilience et Contrôle : l’agent doit être robuste, doit s’adapter au différent cas de figure (vous pourrez tester par exemple que le
résultat ne diverge pas malgré une perte d’information), doit être contrôlé/supervisé par un autre agent
Performance et ESG : l’agent doit être économe en tokens et respecter les critères ESG dans ses analyses et recommandations.


Un titre est un instrument financier représentant un droit de propriété, une créance ou un droit financier détenu par le fonds. Les
principaux types de titres sont :
• Actions : parts de propriété d'une entreprise
• Obligations : titres de créance émis par un État ou une entreprise
• Parts d'OPC (Organisme de Placement Collectif) : investissements dans d'autres fonds.
• Titres monétaires : instruments de court terme comme les certificats de dépôt.
• Produits dérivés : futures, options, swaps utilisés pour couvrir ou exposer le portefeuille à certains risques.
Un émetteur de titre est l'entité qui crée et met en circulation un titre financier afin de lever des fonds auprès des investisseurs.

Type d'émetteur Description Titres émis
Gouvernements qui empruntent pour Obligations d'État, bons du Trésor
financer leurs dépenses publiques
Souverain
Entités publiques bénéficiant d'un fort Obligations d'agence
soutien de l'État
Quasi-souverain /
Agence
Sociétés industrielles, commerciales ou de Actions, obligations corporate
services
Entreprises non
financières
Actions, obligations bancaires, certificats de dépôt
Établissements financiers qui financent leur activité et respectent des exigences réglementaires
Titres émis : obligations bancaires, certificats de dépôt

Un fonds d'investissement est un véhicule qui collecte l'argent de plusieurs investisseurs pour l'investir dans un
portefeuille d'actifs financiers géré par des investisseurs professionnels. Chaque investisseur détient des parts.
Exemple : 1 000 investisseurs placent chacun 1 000 €. Le fonds dispose ainsi de 1 000 000 € à investir. Le gérant du fonds
achète des actions, obligations, titres monétaires ou autres actifs selon la stratégie du fonds. Sachant que :
• Part : unité détenue par l'investisseur.
• Valeur liquidative (VL) : prix d'une part du fonds.
• Actif net : valeur totale du portefeuille.
• Souscription : achat de parts.
• Rachat : vente de parts.
• Coupon / Distribution : revenu versé aux investisseurs.
• Prospectus / Notice : document décrivant les caractéristiques du fonds.

Une notice de fonds d’investissement est un document officiel qui présente de manière détaillée les caractéristiques d'un fonds
(OPCVM, SICAV, FCP, ETF, fonds de private equity, etc.) et les événements de gestion afin d'informer les investisseurs avant qu'ils ne
souscrivent.
Les événements de gestion sont les opérations ou changements importants qui affectent la vie du fonds tels que (liste non exhaustive) :
• Appel de fonds / remboursement
• Changement de dénomination du fonds
• Modification de la stratégie d'investissement
• Création de nouvelles catégories de parts
• Évolution des frais
• Fusion de fonds

Une opération sur titre est un événement qui modifie les caractéristiques d'un titre financier (action, obligation, part
de fonds, etc.) ou les droits de son détenteur.
Les OST dites « d'office » sont des OST obligatoires pour lesquelles l'investisseur n'a aucune décision à prendre.
Les plus courantes sont :
• Distribution de dividende
Une entreprise verse une partie de ses bénéfices aux actionnaires.
Exemple : vous détenez 100 actions d’une entreprise et le dividende est de 3 € par action. Vous recevez ainsi 300 €.
• Fractionnement d'actions (Split)
A l’initiative de l’entreprise, une action peut être divisée en plusieurs actions.
Exemple : split 1 pour 5. Une action valant 500 € devient 5 actions valant 100 € chacune.
• Remboursement anticipé d'obligation
L'émetteur rembourse le capital avant l'échéance. C'est le même principe que le remboursement anticipé d'un crédit.
• Règlement de coupon d'une obligation
Le coupon d’une obligation est le montant des intérêts versés périodiquement aux détenteurs du titre.
• Bonus Issue (attribution gratuite d'actions dans le cadre d’un dividende) est une opération sur titre par laquelle
une société distribue gratuitement de nouvelles actions à ses actionnaires. Au lieu de verser un dividende en
espèces, l'entreprise attribue des actions supplémentaires aux actionnaires.

Le prix d'une obligation (prix de marché) est la valeur à laquelle elle s'achète ou se vend sur le marché.
Il faut distinguer :
• Valeur nominale : montant remboursé à l'échéance (par exemple 1 000 €).
• Prix de marché : le prix d’une obligation s’exprime et s’échange en pourcentage du pair.
Exemple : une obligation peut s'échanger au prix de marché :
• 98.00 (sous le pair)
• 100.00 (au pair)
• 105.00 (au-dessus du pair)

La courbe de taux (yield curve) représente les taux d'intérêt d'emprunts de même qualité de crédit mais de maturités différentes.
Exemple : pour les obligations d'État françaises, en reliant ces points, on obtient la courbe des taux.

Maturité Taux
1 an 2,0 %
2 ans 2,2 %
5 ans 2,5 %
10 ans 3,0 %
30 ans 3,4 %

La courbe de spread représente l'écart de rendement entre une obligation risquée et une obligation de
référence sans risque, selon la maturité. Le spread mesure donc la rémunération du risque de crédit.
Exemple : le spread = taux obligation d'entreprise − taux sans risque. En reliant ces points, on obtient la courbe
de spread.

Maturité / Taux obligation entreprise / Taux État français / Spread

2 ans 2,8 % 2,0 % 80 bps
5 ans 3,7 % 2,5 % 120 bps
10 ans 4,7 % 3,0 % 170 bps
30 ans 5,5 % 3,4 % 210 bps
La courbe de spread permet ainsi de visualiser le risque de crédit additionnel exigé par les investisseurs pour détenir des obligations risquées par rapport aux obligations sans risque.

POINTS DE BASE (BPS)
En finance obligataire :
• 1 % = 100 points de base (bps)
• 0,50 % = 50 bps
• 1,75 % = 175 bps
Les spreads sont presque toujours exprimés en bps.

Les données ESG sont les informations utilisées pour évaluer la performance d'une entreprise, d'un émetteur ou d'un fonds selon des critères Environnementaux, Sociaux et de Gouvernance.

Pilier Signification Exemples de données
Émissions de CO₂, consommation d'énergie, gestion des déchets,
utilisation de l'eau
E Environnement
Accidents du travail, diversité, formation des salariés, respect des droits
humains
S Social
Composition du conseil d'administration, indépendance des
administrateurs, politique de rémunération, lutte contre la corruption
G Gouvernance
Exemples de données : composition du conseil d'administration, indépendance des administrateurs, politique de rémunération, lutte contre la corruption, respect des droits humains, diversité, formation des salariés

*****************
Déterminer le pricing d'une obligation à partir d'un panel d'obligations comparables et de l'obligation offrant le meilleur taux de rendement
Périmètre métier Front-Office
Hors outils
Produits Obligations cotées
Cas d’usage sur le pricing des obligations :

La Caisse des Dépôts évalue régulièrement de nouvelles opportunités d'investissement obligataire :
Pour estimer le prix d'une obligation, elle recherche des obligations comparables dont le prix est connu (niveau de risque, durée, caractéristiques financières)
Principe similaire à l'estimation immobilière par biens comparables
Méthode particulièrement utile pour les obligations non liquides, dont le prix n'est pas directement observable sur le marché
L'objectif : concevoir un agent IA capable de déterminer le prix d'une obligation en constituant un panel de titres comparables issus d'une base officielle, puis en en déduisant un prix d'équivalence.

01
Analyser la demande. À partir d'une demande de pricing formulée par un utilisateur, l'agent analyse la requête et extrait les informations pertinentes (données structurées) nécessaires à la constitution du panel.
02
Constituer le panel. Sur la base de ces caractéristiques, l'agent constitue un panel à partir d'une base officielle en identifiant les obligations « comparables » à celle dont le pricing est demandé.
03
Déterminer le prix. À partir de ce panel, l'agent détermine un prix d'équivalence pour l'obligation.
04
Tracer & restituer. L'agent documente ses choix de constitution du panel et les données utilisées, puis informe l'utilisateur des traitements réalisés.
Cas pratiques : trois obligations doivent être pricées.
Cas simple — de nombreux points de courbe de taux ou de spread.
Cas intermédiaire — peu de points, mais un univers d'investissement permettant de trouver facilement des obligations comparables.
Cas complexe — aucun point de courbe pour l'émetteur, peu ou pas de courbes pour les émetteurs comparables et très peu de titres comparables. Les caractéristiques de l'obligation à pricer sont très spécifiques et peu communes (ex : label ESG, call peu commun).

=============================

https://confluence.serv.cdc.fr/pages/viewpage.action?pageId=1626538620

C:\Users\fazoulay\Downloads\ESCP-FINANCE\

=============================

Je vais comparer les contrôles et colonnes de « Comparables light » à ceux de « Comparables full », puis suivre le modèle Full pour comprendre comment définir « ELIGIBLE » sans confondre éligibilité et statut de pricing. Hypothèse: le champ d’écart se réutilise directement, mais la nouvelle colonne doit être dérivée ou importée selon le modèle Full.




Le Full représente des options, contrairement au panel obligataire Light. Je vérifie comment ses lignes sont tarifées et si elles se rattachent à une obligation importée; cela déterminera une règle d’éligibilité cohérente plutôt qu’un statut arbitraire.





La colonne Full contient des options dont le sous-jacent est une obligation, tandis que le champ d’écart de maturité ne concerne que l’éligibilité du sous-jacent. Je vérifie les données d’import et la validation de pricing pour ancrer la règle Full sur les mêmes critères que Light: devise, obligation cible distincte et échéance dans la tolérance.

Les options synthétiques référencent bien des obligations présentes dans le panel (underlyingSecurityId), ce qui permet d’évaluer « ELIGIBLE » avec les critères Light plutôt qu’avec le statut de pricing. Je vérifie les filtres, le tri et le regroupement Full pour intégrer une colonne calculée sans la rendre obsolète quand la cible ou la tolérance change.





Les jeux de données confirment la règle: les options Full référencent un underlyingSecurityId de type BOND, et celui-ci peut être comparé au panel importé avec la tolérance du backend. J’ajoute le contrôle Full et une colonne calculée sur la devise, l’identité et la maturité de l’obligation sous-jacente; quand le panel manque, le statut restera « À analyser ».

En résumé, l’objectif est de s’assurer que la colonne « ELIGIBLE » reflète correctement l’éligibilité du sous-jacent obligataire, en s’appuyant sur les critères de validation du Full tout en restant cohérent avec le modèle Light. Cela implique de vérifier la devise, l’obligation cible et l’échéance, et de ne pas confondre éligibilité et statut de pricing.