"""Exemple 2 - un mini-agent ReAct branché sur un serveur MCP.

Là où connexion_simple.py appelle les outils À LA MAIN, ici un LLM
(Mistral, via LangChain) décide TOUT SEUL quels outils appeler, avec
quels arguments, en lisant leur description, puis répond à l'utilisateur
en français. C'est le principe d'un agent : une boucle ReAct.

    Vous : « Combien font 128 et 256 ? »
    Agent (pense) : « l'outil add(a, b) correspond »
    Agent (agit)  : appelle add(a=128, b=256) sur le serveur MCP
    Agent (observe): reçoit 384
    Agent (répond): « 128 + 256 = 384 »

Le cycle : découverte des outils du serveur (tools/list) → transformation
en outils LangChain (un « StructuredTool » par outil MCP) → agent ReAct
(langgraph) qui choisit et appelle → réponse.

Prérequis : une clé Mistral dans .env (MISTRAL_API_KEY), en plus de
MCP_SERVER_URL / MCP_API_KEY. La partie `creer_client` est la même que
dans connexion_simple.py : chaque script reste autonome, vous pouvez
copier un seul des deux fichiers.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any, Union

from dotenv import load_dotenv
from fastmcp import Client
from fastmcp.exceptions import ToolError
from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent
from pydantic import Field, create_model

PROMPT_SYSTEME = (
    "Tu es un assistant branché à un serveur MCP. Pour répondre à "
    "l'utilisateur, choisis et appelle les outils MCP disponibles quand "
    "c'est pertinent. Réponds toujours en français, de façon concise. "
    "Si un outil échoue, explique l'erreur à l'utilisateur."
)


# ---------------------------------------------------------------------------
# 1. Configuration et connexion (identique à connexion_simple.py)
# ---------------------------------------------------------------------------


def charger_configuration() -> tuple[str, str, str, str]:
    """Lire .env : le serveur MCP, sa clé, et la clé/modèle Mistral."""
    load_dotenv()
    url = os.environ.get("MCP_SERVER_URL", "").strip()
    cle_mcp = os.environ.get("MCP_API_KEY", "").strip()
    cle_mistral = os.environ.get("MISTRAL_API_KEY", "").strip()
    modele = os.environ.get("MISTRAL_MODEL", "mistral-small-latest").strip()
    if not url:
        raise SystemExit(
            "MCP_SERVER_URL est vide : copiez .env.example en .env et remplissez-le."
        )
    return url, cle_mcp, cle_mistral, modele


def creer_client(url: str, cle: str, timeout: float = 60.0) -> Client:
    """Client fastmcp en streamable HTTP ; Bearer uniquement si clé non vide."""
    if not cle:
        return Client(url, timeout=timeout)
    return Client(url, auth=cle, timeout=timeout)


async def appeler_outil(url: str, cle: str, nom: str, arguments: dict) -> str:
    """Ouvrir un client éphémère, appeler UN outil, renvoyer son résultat en texte.

    Chaque appel ouvre sa propre connexion : rien n'est partagé entre
    deux appels. Si l'outil échoue, on renvoie l'erreur en texte : l'agent
    la lira et pourra l'expliquer à l'utilisateur.
    """
    try:
        async with creer_client(url, cle) as client:
            resultat = await client.call_tool(nom, arguments)
            parties = [getattr(bloc, "text", str(bloc)) for bloc in resultat.content]
            return "\n".join(parties) or "(résultat vide)"
    except ToolError as exc:
        # Une erreur d'outil (refus applicatif, arguments invalides...)
        # n'est PAS une erreur fatale : l'agent doit en prendre connaissance.
        return f"[erreur outil {nom}] {exc}"


# ---------------------------------------------------------------------------
# 2. Découverte des outils MCP → outils LangChain
# ---------------------------------------------------------------------------
# L'agent ne connaît pas MCP : il manipule des « outils LangChain ». On
# fabrique donc un pont : pour chaque outil découvert sur le serveur, un
# StructuredTool portant le même nom, la même description et le même
# schéma d'arguments, dont l'exécution redirige vers le serveur MCP.


def type_python(definition: Any) -> Any:
    """Traduire un type du schéma JSON en type Python (pour pydantic).

    Le serveur décrit ses arguments en JSON Schema (string, number,
    integer, boolean, array, object). Un champ optionnel arrive en
    « anyOf » ou en liste de types : on garde le type non nul.
    """
    if not isinstance(definition, dict):
        return Any
    variantes = definition.get("anyOf") or definition.get("oneOf")
    if isinstance(variantes, list):
        types = [
            type_python(v)
            for v in variantes
            if isinstance(v, dict) and v.get("type") != "null"
        ]
        if not types:
            return Any
        return types[0] if len(types) == 1 else Union[tuple(types)]
    type_json = definition.get("type")
    if isinstance(type_json, list):  # ex. ["string", "null"]
        type_json = next((t for t in type_json if t != "null"), None)
    if type_json == "array":
        return list
    if type_json == "object":
        return dict
    return {"string": str, "number": float, "integer": int, "boolean": bool}.get(
        type_json, Any
    )


def construire_modele(nom_outil: str, schema: dict) -> type:
    """Fabriquer un modèle pydantic depuis le schéma JSON d'un outil.

    C'est ce modèle qui dit à l'agent (au LLM) quels arguments existent,
    lesquels sont obligatoires, et leur description. Même astuce que pour
    la docstring serveur : la description vient du schéma du serveur.
    """
    proprietes = (schema or {}).get("properties", {})
    requis = set((schema or {}).get("required", []))
    champs: dict[str, Any] = {}
    for nom, definition in proprietes.items():
        # Obligatoire → « ... » (aucun défaut) ; optionnel → None, que
        # l'on retirera avant l'appel pour laisser le serveur appliquer
        # ses propres valeurs par défaut.
        champs[nom] = (
            type_python(definition),
            Field(
                default=... if nom in requis else None,
                description=definition.get("description", ""),
            ),
        )
    nom_sure = "".join(c if c.isalnum() else "_" for c in nom_outil)
    return create_model(f"{nom_sure}Args", **champs)


def fabriquer_execution(nom_outil: str, url: str, cle: str):
    """Capturer le nom de l'outil et renvoyer ses deux exécuteurs.

    LangGraph appelle un outil soit en asynchrone (await coroutine), soit
    depuis un fil séparé (func) : on fournit les deux. Sans cette
    fermeture, toutes les fonctions captureraient le dernier nom d'outil
    de la boucle.
    """

    def executer(**kwargs: Any) -> str:
        arguments = {k: v for k, v in kwargs.items() if v is not None}
        return asyncio.run(appeler_outil(url, cle, nom_outil, arguments))

    async def aexecuter(**kwargs: Any) -> str:
        arguments = {k: v for k, v in kwargs.items() if v is not None}
        return await appeler_outil(url, cle, nom_outil, arguments)

    return executer, aexecuter


async def decouvrir_outils(url: str, cle: str) -> list[StructuredTool]:
    """Demander le catalogue au serveur et le transformer en outils LangChain."""
    async with creer_client(url, cle) as client:
        specs = await client.list_tools()  # → « tools/list »

    outils: list[StructuredTool] = []
    for spec in specs:
        executer, aexecuter = fabriquer_execution(spec.name, url, cle)
        outils.append(
            StructuredTool.from_function(
                func=executer,
                coroutine=aexecuter,
                name=spec.name,
                description=spec.description or f"Outil MCP : {spec.name}",
                args_schema=construire_modele(spec.name, spec.input_schema),
            )
        )
    return outils


# ---------------------------------------------------------------------------
# 3. L'agent et la boucle de conversation
# ---------------------------------------------------------------------------


def en_texte(contenu: Any) -> str:
    """Normaliser le contenu d'un message (str ou liste de blocs) en texte."""
    if contenu is None:
        return ""
    if isinstance(contenu, str):
        return contenu
    if isinstance(contenu, list):
        return "".join(
            bloc.get("text", "") if isinstance(bloc, dict) else str(bloc)
            for bloc in contenu
        )
    return str(contenu)


def afficher_trace(messages: list) -> None:
    """Montrer le raisonnement de l'agent : outils appelés, résultats, réponse."""
    for message in messages:
        if isinstance(message, AIMessage) and message.tool_calls:
            for appel in message.tool_calls:
                print(f"  [outil]   {appel['name']}({appel['args']})")
        elif isinstance(message, ToolMessage):
            print(f"  [résultat] {en_texte(message.content).strip()}")
    # La réponse finale est le dernier message de l'assistant.
    for message in reversed(messages):
        if isinstance(message, AIMessage) and en_texte(message.content).strip():
            print(f"\nAgent : {en_texte(message.content).strip()}")
            break


async def principal() -> None:
    url, cle_mcp, cle_mistral, modele = charger_configuration()

    # D'abord la connexion MCP : si elle échoue, inutile d'aller plus loin.
    print(f"Connexion à {url}…")
    outils = await decouvrir_outils(url, cle_mcp)
    if not outils:
        raise SystemExit("Aucun outil découvert : vérifiez MCP_SERVER_URL / MCP_API_KEY.")
    print("Outils découverts :")
    for outil in outils:
        description = (outil.description or "").strip().splitlines()
        premiere_ligne = description[0] if description else "(sans description)"
        print(f"  - {outil.name} : {premiere_ligne}")

    if not cle_mistral:
        raise SystemExit(
            "MISTRAL_API_KEY est vide : l'agent a besoin d'une clé Mistral "
            "(renseignez-la dans .env)."
        )

    # Le LLM qui raisonne, puis l'agent ReAct assemblé par langgraph :
    # une boucle « penser → appeler un outil → observer → répondre ».
    llm = init_chat_model(modele, model_provider="mistralai", api_key=cle_mistral)
    agent = create_react_agent(
        model=llm,
        tools=outils,
        checkpointer=InMemorySaver(),  # mémoire de conversation en RAM
        prompt=PROMPT_SYSTEME,
    )

    print("\nPosez vos questions (« quit » ou Ctrl+D pour sortir).")
    fil = {"configurable": {"thread_id": "console"}}  # même fil = même conversation
    while True:
        try:
            question = input("\nVous : ").strip()
        except EOFError:
            break
        if not question or question.lower() in {"quit", "exit", "q"}:
            break
        # ainvoke déroule toute la boucle ReAct : l'agent peut appeler
        # plusieurs outils de suite avant de répondre.
        reponse = await agent.ainvoke({"messages": [HumanMessage(content=question)]}, fil)
        afficher_trace(reponse["messages"])


if __name__ == "__main__":
    asyncio.run(principal())
