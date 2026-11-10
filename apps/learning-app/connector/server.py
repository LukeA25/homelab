"""Run under the private Secure MCP Tunnel client over stdio."""
from typing import Annotated

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from app.recap import Recap
from connector import bridge

mcp = FastMCP(
    "Learning Grove",
    instructions=(
        "Start a lesson with get_next_session and use its prompt and current context. "
        "Teach through short dialogue, one question at a time. At the end, preview the "
        "structured recap and show the learner every proposed update. Call accept_session_recap "
        "with the exact preview only after the learner explicitly approves saving. "
        "If the recap changes, preview it again before asking for approval."
    ),
)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=False))
def get_next_session(tree_id: str | None = None) -> dict:
    """Load the next concept from an active path and reuse or create a pending session."""
    return bridge.get_next_session(tree_id)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=False))
def get_concept(tree_id: str, concept_id: str) -> dict:
    """Read a concept's notes, evidence, prerequisites, and relevant accepted recaps."""
    return bridge.get_concept(tree_id, concept_id)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=False))
def submit_session_recap(recap: Recap) -> dict:
    """Validate a recap without saving it. Show the returned proposal before asking to save."""
    return bridge.api("POST", "/api/import/preview", recap.model_dump())


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False))
def accept_session_recap(recap: Recap) -> dict:
    """Save the exact previewed recap only after the learner explicitly approves saving it."""
    return bridge.api("POST", "/api/import/accept", recap.model_dump())


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False))
def capture_interest(text: Annotated[str, Field(min_length=1, max_length=4000)]) -> dict:
    """Save a learner-requested interest in the idea inbox."""
    return bridge.api("POST", "/api/ideas", {"text": text})


if __name__ == "__main__":
    mcp.run(transport="stdio")
