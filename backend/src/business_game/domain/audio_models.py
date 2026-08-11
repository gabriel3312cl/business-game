from datetime import datetime

from pydantic import BaseModel


class GameAudioCatalogItem(BaseModel):
    sound_id: str
    custom: bool
    source_url: str | None = None
    original_filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    updated_at: datetime | None = None
