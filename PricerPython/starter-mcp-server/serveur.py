"""Un serveur MCP minimal pour comprendre comment tout marche, de zéro.

QU'EST-CE QUE MCP ?
-------------------
MCP (Model Context Protocol) est un protocole ouvert qui permet à un
agent IA (un client MCP, un agent LangChain, un assistant...) de
découvrir et d'appeler des *outils* exposés par un serveur, via des
échanges JSON-RPC bien définis. Le protocole définit trois primitives :

  - les *tools*    : des fonctions que l'agent peut appeler (un calcul,
                     une requête vers une API métier...), c'est ce que
                     ce serveur montre ;
  - les *resources* : des documents en lecture seule (non couverts ici) ;
  - les *prompts*  : des modèles de questions préparés (non couverts).

LE CYCLE D'UNE REQUÊTE
----------------------
    L'agent                        Ce serveur
       |   « initialize »               |
       |------------------------------>|  le serveur se présente (nom, version)
       |   « tools/list »               |
       |------------------------------>|  le serveur répond son catalogue :
       |   nom + description +         |  pour chaque outil, le nom, la
       |   schéma des arguments        |  description et le schéma JSON des
       |<------------------------------|  arguments
       |   « tools/call add            |
       |        {"a": 2, "b": 3} »     |  le serveur exécute la fonction
       |------------------------------>|  Python correspondante et renvoie
       |        5                      |  le résultat
       |<------------------------------|

L'agent lit la DESCRIPTION de chaque outil (sa docstring !) pour décider
lequel appeler, puis remplit les arguments en suivant le SCHÉMA JSON
généré automatiquement depuis les annotations de type Python. Une
docstring claire = un agent qui utilise bien votre outil.

COMMENT LIRE CE FICHIER
-----------------------
Tout tient dans un seul fichier :
  1. la création du serveur (section 1, juste en dessous) ;
  2. la déclaration des outils (section 2) ;
  3. le lancement (section 3, tout en bas), avec le choix du transport :
     « stdio » par défaut, ou « http ».

Pour essayer ce serveur, voir le README du dépôt (installation, lancement,
et test avec le dépôt mcp-client-exemple).
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone

from fastmcp import FastMCP

# ---------------------------------------------------------------------------
# 1. Création du serveur
# ---------------------------------------------------------------------------
# `FastMCP` est l'objet serveur : il écoute les requêtes MCP, tient le
# registre des outils et gère le protocole JSON-RPC pour nous.
# Le `name` est purement informatif : c'est le nom sous lequel le serveur
# se présente à l'agent lors du « handshake » (initialize).

mcp = FastMCP(name="mcp-serveur-minimal")

# ---------------------------------------------------------------------------
# 2. Les outils
# ---------------------------------------------------------------------------
# Un outil = une simple fonction Python + le décorateur `@mcp.tool`.
# Trois choses partent vers l'agent :
#   - le NOM de la fonction : c'est l'identifiant utilisé dans « tools/call »
#     (convention : des mots séparés par des underscores, comme add_numbers) ;
#   - la DOCSTRING : elle devient la description de l'outil, le texte que
#     l'agent lit pour décider de l'appeler ou non. Écrivez-la pour un
#     agent, pas pour un humain : dites CE QUE fait l'outil et À QUOI il
#     sert, pas comment il est codé ;
#   - les ANNOTATIONS DE TYPE : elles deviennent le schéma JSON des
#     arguments (fastmcp les transforme via pydantic). Le serveur refuse
#     les arguments au mauvais format AVANT que le code de l'outil ne
#     s'exécute.
# La valeur de retour part aussi vers l'agent : un str devient un bloc de
# texte ; un dict ou une list est sérialisé en JSON.


@mcp.tool
def say_hello(name: str) -> str:
    """Dire bonjour à la personne dont le nom est donné.

    Args:
        name: le prénom de la personne à saluer.
    """
    return f"Bonjour, {name} !"


@mcp.tool
def add(a: float, b: float) -> float:
    """Additionner deux nombres et renvoyer leur somme.

    Args:
        a: le premier nombre.
        b: le second nombre.
    """
    return a + b


@mcp.tool
def get_server_time() -> dict:
    """Renvoyer l'heure actuelle du serveur, en UTC.

    Cet outil ne prend aucun argument. Sa réponse est un objet JSON à
    trois champs : il montre qu'un outil peut renvoyer une donnée
    structurée, et pas seulement du texte. L'agent lit les clés comme
    un humain lit un tableau.
    """
    maintenant = datetime.now(timezone.utc)
    return {
        "utc_iso": maintenant.isoformat(),
        "timestamp": maintenant.timestamp(),
        "fuseau": "UTC",
    }


# Si un outil doit échouer proprement (fichier introuvable, montant
# négatif...), levez une exception avec un message en français : fastmcp
# la transforme en résultat d'erreur MCP, que l'agent lira et saura
# expliquer à l'utilisateur. Le serveur ne plante pas.


# ---------------------------------------------------------------------------
# 3. Lancement
# ---------------------------------------------------------------------------
# Le même serveur peut être servi de deux façons, choisies au lancement :
#
#   - « stdio » (défaut) : le serveur lit la conversation MCP sur son
#     entrée standard et écrit sur sa sortie standard. C'est le mode des
#     serveurs locaux branchés dans un poste de travail (MCP Inspector,
#     clients bureautiques). Zéro réseau.
#
#   - « http » : le serveur écoute sur http://127.0.0.1:8000/mcp en
#     « streamable HTTP ». Un client distant envoie des requêtes POST
#     JSON-RPC ; chaque requête est autonome, sans session en mémoire.
#
# En stdio, n'écrivez JAMAIS sur la sortie standard en dehors du protocole
# (pas de print() de debug !) : la sortie standard EST le canal MCP, un
# print parasite corromprait la conversation. En http, vous pouvez.


def main() -> None:
    """Lancer le serveur, le transport étant choisi en ligne de commande."""
    parseur = argparse.ArgumentParser(
        description="Mini serveur MCP de démonstration.",
    )
    parseur.add_argument(
        "--transport",
        choices=["stdio", "http"],
        default="stdio",
        help="mode de desserte : « stdio » (défaut) ou « http »",
    )
    transport = parseur.parse_args().transport

    if transport == "http":
        print("Serveur prêt sur http://127.0.0.1:8000/mcp (Ctrl+C pour arrêter)")
        mcp.run(transport="http", host="127.0.0.1", port=8000)
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
