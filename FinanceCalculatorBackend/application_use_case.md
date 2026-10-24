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