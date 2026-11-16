"""Exemple 1 : se connecter à un serveur MCP et explorer ses outils.

Ce script se connecte au serveur MCP dont l'URL est configurée dans le
fichier `.env` (voir .env.example), affiche le catalogue des outils
découverts, et peut appeler un outil de votre choix.

Trois échanges MCP se produisent, gérés par fastmcp :

  1. « initialize »        : le client et le serveur se présentent ;
  2. « tools/list »        : le client découvre les outils (nom,
                             description, schéma des arguments) ;
  3. « tools/call »        : le client appelle un outil avec des
                             arguments JSON.

Exemples :
    python connexion_simple.py                                  # lister
    python connexion_simple.py --outil say_hello --args '{"name": "MCP"}'
    python connexion_simple.py --outil add --args '{"a": 2, "b": 3}'
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os

import httpx
from dotenv import load_dotenv
from fastmcp import Client
from fastmcp.exceptions import ClientError, ToolError


def charger_configuration() -> tuple[str, str]:
    """Lire l'URL du serveur et la clé API dans `.env` (ou l'environnement).

    `load_dotenv()` charge le fichier `.env` du dossier courant s'il
    existe, sans écraser les variables déjà présentes dans l'environnement.
    """
    load_dotenv()
    url = os.environ.get("MCP_SERVER_URL", "").strip()
    cle = os.environ.get("MCP_API_KEY", "").strip()
    if not url:
        raise SystemExit(
            "MCP_SERVER_URL est vide : copiez .env.example en .env et remplissez-le."
        )
    return url, cle


def creer_client(url: str, cle: str) -> Client:
    """Fabriquer un client fastmcp pour une URL en streamable HTTP.

    fastmcp déduit le transport de l'URL : `http://` ou `https://` →
    streamable HTTP.

    La clé est optionnelle :
      - clé VIDE  → aucune en-tête Authorization n'est envoyée. C'est le
        cas d'un serveur local sans authentification (le dépôt
        mcp-serveur-minimal, par exemple). Ne mettez PAS un Bearer vide :
        httpx le rejetterait avant même d'envoyer la requête ;
      - clé RENSEIGNÉE → fastmcp la transforme en en-tête
        `Authorization: Bearer <clé>`.
    """
    if not cle:
        return Client(url, timeout=15.0)
    return Client(url, auth=cle, timeout=15.0)


def afficher_outils(outils: list) -> None:
    """Afficher le catalogue : nom, description, schéma des arguments."""
    if not outils:
        print("Le serveur n'expose aucun outil.")
        return
    print(f"\n{len(outils)} outil(s) disponible(s) :")
    for outil in outils:
        description = (outil.description or "").strip().splitlines()
        premiere_ligne = description[0] if description else "(sans description)"
        print(f"  - {outil.name} : {premiere_ligne}")
        # Le schéma JSON des arguments : c'est ce que l'agent lit pour
        # savoir quoi remplir. Ici, on affiche juste les propriétés.
        schema = outil.input_schema or {}
        proprietes = schema.get("properties", {})
        if proprietes:
            print(f"      arguments : {json.dumps(proprietes, ensure_ascii=False)}")
    print()


def resultat_en_texte(resultat) -> str:
    """Mettre à plat un résultat d'outil (une liste de blocs de contenu)."""
    parties = [getattr(bloc, "text", str(bloc)) for bloc in resultat.content]
    texte = "\n".join(parties)
    if resultat.is_error:
        return f"[erreur] {texte}"
    return texte or "(résultat vide)"


async def sonder_statut_http(url: str, cle: str) -> int | None:
    """Refaire une mini-requête MCP « à nu » pour retrouver le statut HTTP.

    Quand le serveur répond avec une erreur HTTP (401, 500...), le client
    MCP la transforme en erreur JSON-RPC générique : le code de statut se
    perd. On refait donc la requête avec httpx pour le retrouver.
    """
    en_tetes = {"accept": "application/json, text/event-stream"}
    if cle:
        en_tetes["authorization"] = f"Bearer {cle}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            reponse = await client.post(
                url,
                headers=en_tetes,
                json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
            )
            return reponse.status_code
    except BaseException:  # best effort : si la sonde échoue, tant pis
        return None


def decrire_erreur(exc: BaseException, url: str, cle: str) -> str:
    """Traduire un échec en message français actionnable."""
    if isinstance(exc, (ClientError, ToolError)):
        # Le serveur a répondu : c'est le protocole qui refuse (outil
        # inconnu, arguments invalides, refus applicatif...).
        return f"Erreur MCP renvoyée par le serveur : {exc}"
    message = str(exc).lower()
    if "illegal header value" in message and "bearer" in message:
        return "Clé API invalide (caractères interdits) : vérifiez MCP_API_KEY."
    if "could not infer a valid transport" in message or "invalid url" in message:
        return f"URL invalide : {url!r} (attendu : http://…/mcp)"
    if "failed to connect" in message or "connection attempt" in message:
        return f"Connexion impossible sur {url} : le serveur est-il démarré ?"
    if "server returned an error response" in message:
        # Le statut HTTP réel est masqué → on le re-sonde.
        return "Le serveur a répondu avec une erreur HTTP."
    return f"Erreur inattendue : {exc.__class__.__name__} : {exc}"


async def principal() -> None:
    parseur = argparse.ArgumentParser(
        description="Se connecter à un serveur MCP : lister les outils, "
        "et éventuellement en appeler un."
    )
    parseur.add_argument(
        "--outil",
        help="nom de l'outil à appeler (défaut : aucun, on liste seulement)",
    )
    parseur.add_argument(
        "--args",
        default="{}",
        help='arguments de l\'outil, en JSON (ex. \'{"a": 2, "b": 3}\')',
    )
    args = parseur.parse_args()

    url, cle = charger_configuration()
    try:
        arguments = json.loads(args.args)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"--args n'est pas un JSON valide : {exc}")

    mode = "avec clé API (Bearer)" if cle else "sans clé (serveur local)"
    print(f"Connexion à {url} ({mode})…")

    try:
        # `async with` : le client ouvre la connexion (initialize), puis
        # la referme proprement en sortant. Chaque appel ci-dessous est
        # une requête JSON-RPC autonome.
        async with creer_client(url, cle) as client:
            outils = await client.list_tools()  # → « tools/list »
            afficher_outils(outils)

            if args.outil:
                print(f"Appel de l'outil {args.outil} avec {arguments}…")
                resultat = await client.call_tool(args.outil, arguments)  # → « tools/call »
                print(f"Résultat : {resultat_en_texte(resultat)}")
    except BaseException as exc:
        message = decrire_erreur(exc, url, cle)
        if message == "Le serveur a répondu avec une erreur HTTP.":
            statut = await sonder_statut_http(url, cle)
            if statut in (401, 403):
                message = (
                    f"Authentification refusée ({statut}) : "
                    "la clé MCP_API_KEY est-elle valide ?"
                )
            elif statut is not None:
                message = f"Erreur HTTP {statut} renvoyée par le serveur."
        raise SystemExit(message)


if __name__ == "__main__":
    # fastmcp est asynchrone : on lance la boucle d'événements ici,
    # une seule fois pour tout le script.
    asyncio.run(principal())
