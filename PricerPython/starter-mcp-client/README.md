# mcp-client-exemple - se connecter à un serveur MCP

Deux scripts autonomes, commentés en français, pour parler à un serveur
MCP. Le protocole est le même partout : d'un serveur à l'autre, seul le
`.env` change.

- `connexion_simple.py` : se connecter, lister les outils, en appeler un
  à la main avec des arguments JSON. Le point d'entrée minimal.
- `agent_langchain.py` : un mini-agent ReAct (LangChain + Mistral) qui
  découvre les outils du serveur et décide seul lesquels appeler pour
  répondre à vos questions.

## Démarrage

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env             # puis remplissez-le (voir ci-dessous)
```

## Configurer le `.env`

Deux scénarios, mêmes variables :

- serveur local : le dépôt `mcp-serveur-minimal` lancé avec
  `python serveur.py --transport http`. Pas d'authentification ici, on
  laisse `MCP_API_KEY` vide :

  ```dotenv
  MCP_SERVER_URL=http://127.0.0.1:8000/mcp
  MCP_API_KEY=
  ```

- serveur d'équipe pendant le hackathon : l'URL et la clé qui vous seront
  remises :

  ```dotenv
  MCP_SERVER_URL=https://VOTRE-SERVEUR.exemple/mcp
  MCP_API_KEY=VOTRE-CLE
  ```

Le comportement de la clé est le même partout : vide, aucune en-tête
`Authorization` n'est envoyée ; renseignée, elle part dans l'en-tête
`Authorization: Bearer <clé>`.

## Exemple 1 : appeler un outil à la main

```bash
python connexion_simple.py                                   # lister les outils
python connexion_simple.py --outil say_hello --args '{"name": "MCP"}'
python connexion_simple.py --outil add --args '{"a": 2, "b": 3}'
```

Le script charge le `.env`, ouvre le client fastmcp (handshake
`initialize`), fait un `tools/list` pour découvrir le catalogue, puis,
si vous avez demandé un outil, un `tools/call` avec vos arguments.

## Exemple 2 : laisser un agent décider

En plus de `MCP_SERVER_URL` / `MCP_API_KEY`, il faut une clé Mistral
dans le `.env` :

```dotenv
MISTRAL_API_KEY=VOTRE-CLE-MISTRAL
MISTRAL_MODEL=mistral-small-latest
```

Puis :

```bash
python agent_langchain.py
```

L'agent découvre d'abord les outils du serveur, puis vous posez vos
questions en français. Il affiche chaque outil appelé, ses arguments, le
résultat, puis sa réponse. Avec le serveur minimal : « Combien font 128
et 256 ? » → il appelle `add`.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `Authentification refusée (401/403)` | Clé `MCP_API_KEY` invalide, ou absente alors que le serveur en exige une. |
| `Connexion impossible sur …` | Le serveur n'est pas démarré, ou l'URL/port est fausse. |
| `URL invalide : …` | Le format attendu est `http://hote:port/mcp`. |
| `Erreur MCP renvoyée par le serveur : Unknown tool` | Le nom passé à `--outil` n'existe pas : listez d'abord les outils. |
| `--args n'est pas un JSON valide` | Les arguments doivent être du JSON : guillemets doubles, pas de guillemets autour des nombres. |
| L'agent appelle un outil avec des arguments absurdes | La docstring de l'outil côté serveur est trop vague : c'est elle qui guide l'agent. |

## Ensuite ?

- Pour écrire vos propres outils, voir le dépôt `mcp-serveur-minimal`.
- Pendant le hackathon, votre client fera la même chose qu'ici : une
  URL, une clé, `tools/list`, `tools/call`.
