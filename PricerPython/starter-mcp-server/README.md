# mcp-serveur-minimal

Un serveur MCP qui tient dans un seul fichier, `serveur.py`. Le but : voir
ce qui se passe entre la déclaration d'un outil Python et son appel par un
agent. Tout le code est commenté en français, section par section. Pas
d'authentification, pas de base de données, pas de Docker. Juste le
protocole.

## MCP en trois échanges

MCP (*Model Context Protocol*) est un protocole ouvert : un agent IA
découvre et appelle des outils exposés par un serveur, via des échanges
JSON-RPC.

1. `initialize` : le client et le serveur se présentent ;
2. `tools/list` : le serveur donne son catalogue (pour chaque outil :
   nom, description, schéma des arguments) ;
3. `tools/call` : le client appelle un outil avec des arguments JSON ; le
   serveur exécute la fonction Python correspondante et renvoie le
   résultat.

Côté serveur, un outil est une fonction Python décorée par `@mcp.tool` :

- sa docstring devient la description que l'agent lit pour décider s'il
  appelle l'outil : écrivez-la pour un agent, pas pour un humain ;
- ses annotations de type deviennent le schéma JSON des arguments, validé
  avant l'exécution.

## Démarrage

```bash
python -m venv .venv
source .venv/bin/activate        # Windows : .venv\Scripts\activate
pip install -r requirements.txt

python serveur.py                  # mode stdio (défaut)
python serveur.py --transport http # serveur sur http://127.0.0.1:8000/mcp
```

En `stdio`, le serveur parle sur l'entrée/sortie standard : c'est le mode
des clients locaux (MCP Inspector, clients bureautiques), sans réseau.
En `http`, il écoute sur `http://127.0.0.1:8000/mcp` en streamable HTTP.

Une règle en `stdio` : la sortie standard est le canal MCP, aucun
`print()` de debug ne doit y passer, sous peine de casser la conversation.
En `http`, vous pouvez imprimer ce que vous voulez.

## Les trois outils de démonstration

- `say_hello` : un argument, une réponse texte. Le plus simple possible.
- `add` : deux arguments numériques, pour voir la validation automatique
  des types.
- `get_server_time` : aucun argument ; renvoie un dict sérialisé en JSON,
  que l'agent lit champ par champ.

## Tester le serveur

Avec le dépôt `mcp-client-exemple` :

```bash
# terminal 1 - ici :
python serveur.py --transport http

# terminal 2 - dans mcp-client-exemple, avec dans .env :
#   MCP_SERVER_URL=http://127.0.0.1:8000/mcp
#   MCP_API_KEY=            (vide : pas d'authentification ici)
python connexion_simple.py                          # lister les outils
python connexion_simple.py --outil say_hello --args '{"name": "MCP"}'
```

Ou avec MCP Inspector, l'explorateur visuel officiel, en mode stdio :

```bash
npx @modelcontextprotocol/inspector python serveur.py
```

## Comprendre le code

`serveur.py` est découpé en trois sections commentées :

1. la création du serveur (`FastMCP(name=...)`, le nom vu par l'agent) ;
2. la déclaration des outils (`@mcp.tool`, docstring, annotations de
   type, valeurs de retour, erreurs) ;
3. le lancement (`argparse` et le choix du transport).

Le docstring d'en-tête reprend le cycle d'une requête
(`initialize` → `tools/list` → `tools/call`) en diagramme.

## Et pendant le hackathon ?

Il vous sera mis à disposition un serveur MCP contenant des outils métiers,
ainsi que l'outil de mail permettant la livraison de votre rendu.
Ce micro-serveur est là si vous souhaitez développer votre propre serveur
dans le cadre de la solution proposée.

