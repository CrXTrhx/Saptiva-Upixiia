"""Base de schemas: requests/responses en camelCase (alias) para el frontend."""
from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Acepta y emite JSON en camelCase, pero permite poblar por nombre snake_case."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


def iso(value: dt.datetime | dt.date | None) -> str | None:
    """Serializa fechas a ISO-8601 (lo que consume el frontend)."""
    if value is None:
        return None
    return value.isoformat()
