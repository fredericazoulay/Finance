SCHEMA BP2S :
Table OBLIGATION :
isin
produit
type_obl
cusip
obligation
emetteur
famille
sousfamille
secteur
type_bbg
convention_int
date_premier_cpn
date_maturite
date_maturite_attendue
date_annonce
prix_remboursement
montant_emission
type_conversion
calendrier
coupon_hybride
convention_calc
devise
prix_emission
lei

Espace partagé : share-team-<N>

PG_HOST : Instance : pgrghackathonteam<N>.hackathon.private 
PG_BASE : Base : hackathon_db 
PG_USER : Rôle : app_user_uc<N> (<N> = numéro du Cas d'Usage) 
PG_PASS : Mot de passe : Fourni par ICDC (pré-saisi dans votre ~/.pgpass)

/home/azureuser/projects/hackathon/ # Extraction locale des projets git /mnt/share-team-<N>/ # docs partagés : synchro automatique !

Pour ouvrir un répertoire avec vscode, taper :
code /home/azureuser/projects/hackathon/

Pour démarrer rapidement, nous vous proposons des exemples de projets :
1. http://git.hackathon.private/hackathon/starter-mcp-client
2. http://git.hackathon.private/hackathon/starter-mcp-server
3. http://git.hackathon.private/hackathon/starter-mistral-studio

.env.example
.gitignore
agent_langchain.py
connexion_simple.py
README.md
requirements.txt

1 - Ouvrir la page web du dépôt Git (http://git.hackathon.private/<nom du projet>)
2 - Déplier le menu d’ouverture du dépôt (cf. illustration plus bas)
3 - Choisir “Open with VS Code”

