"""Auth: Supabase Auth + Postgres roles when configured; local fixtures otherwise.

Agent/LangGraph runtime stays on the FastAPI container — Supabase is identity only.
"""

from monny.auth.deps import require_admin, require_user
from monny.auth.users import AuthenticatedUser, Role

__all__ = [
    "AuthenticatedUser",
    "Role",
    "require_admin",
    "require_user",
]
