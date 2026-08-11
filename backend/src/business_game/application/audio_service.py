from hashlib import sha256
from pathlib import PurePath
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from business_game.domain.audio_models import GameAudioCatalogItem
from business_game.domain.errors import DomainError, NotFoundError
from business_game.infrastructure.audio_repository import GameAudioRepository
from business_game.infrastructure.db_models import GameAudioOverrideRecord

MAX_AUDIO_BYTES = 5_000_000
GAME_SOUND_IDS = (
    "action-rejected",
    "advisor-response",
    "auction-bid",
    "auction-completed",
    "auction-countdown",
    "auction-lost",
    "auction-start",
    "bank-emergency-credit",
    "bank-initialized",
    "bank-loan-defaulted",
    "bank-loan-issued",
    "bank-loan-payment",
    "building-hotel",
    "building-house",
    "building-sold",
    "card-draw",
    "card-negative",
    "card-positive",
    "chat-mention",
    "chat-message",
    "connection-lost",
    "connection-restored",
    "debt-created",
    "debt-paid",
    "dice-doubles",
    "dice-roll-a",
    "dice-roll-b",
    "economy-week-advanced",
    "free-parking-collected",
    "game-finished",
    "game-started",
    "jail-entered",
    "jail-released",
    "jail-roll-failed",
    "market-dividend-paid",
    "market-margin-call",
    "market-opened",
    "market-order-cancelled",
    "market-order-filled",
    "market-order-placed",
    "market-position-liquidated",
    "market-shares-bought",
    "market-shares-sold",
    "payment-received",
    "payment-sent",
    "player-bankrupt",
    "player-joined",
    "player-left",
    "property-declined",
    "property-mortgaged",
    "property-purchase",
    "property-unmortgaged",
    "salary-collected",
    "tax-or-repairs",
    "token-step-metal-soft",
    "token-teleport",
    "trade-accepted",
    "trade-cancelled",
    "trade-proposed",
    "trade-rejected",
    "turn-extra-roll",
    "turn-yours",
    "ui-important-click",
)


class GameAudioService:
    def __init__(self, session: AsyncSession):
        self._session = session
        self._audio = GameAudioRepository(session)

    async def list_catalog(self) -> list[GameAudioCatalogItem]:
        overrides = {record.sound_id: record for record in await self._audio.list()}
        return [
            self._to_catalog_item(sound_id, overrides.get(sound_id))
            for sound_id in GAME_SOUND_IDS
        ]

    async def replace(
        self,
        sound_id: str,
        *,
        filename: str,
        content_type: str | None,
        payload: bytes,
        updated_by: UUID,
    ) -> GameAudioCatalogItem:
        self._require_known_sound(sound_id)
        clean_name, detected_type = self._validate_audio(
            filename,
            content_type,
            payload,
        )
        digest = sha256(payload).hexdigest()
        async with self._session.begin():
            record = await self._audio.replace(
                sound_id,
                original_filename=clean_name,
                content_type=detected_type,
                content=payload,
                size_bytes=len(payload),
                sha256=digest,
                updated_by=updated_by,
            )
        return self._to_catalog_item(sound_id, record)

    async def reset(self, sound_id: str) -> None:
        self._require_known_sound(sound_id)
        async with self._session.begin():
            record = await self._audio.get(sound_id, for_update=True)
            if record is not None:
                await self._audio.delete(record)

    async def get_content(self, sound_id: str) -> GameAudioOverrideRecord:
        self._require_known_sound(sound_id)
        record = await self._audio.get(sound_id)
        if record is None:
            raise NotFoundError("custom game audio was not found")
        return record

    @staticmethod
    def _to_catalog_item(
        sound_id: str,
        record: GameAudioOverrideRecord | None,
    ) -> GameAudioCatalogItem:
        if record is None:
            return GameAudioCatalogItem(sound_id=sound_id, custom=False)
        return GameAudioCatalogItem(
            sound_id=sound_id,
            custom=True,
            source_url=(
                f"/api/v1/audio/{sound_id}?version={record.sha256[:12]}"
            ),
            original_filename=record.original_filename,
            content_type=record.content_type,
            size_bytes=record.size_bytes,
            updated_at=record.updated_at,
        )

    @staticmethod
    def _require_known_sound(sound_id: str) -> None:
        if sound_id not in GAME_SOUND_IDS:
            raise NotFoundError("game sound was not found")

    @staticmethod
    def _validate_audio(
        filename: str,
        content_type: str | None,
        payload: bytes,
    ) -> tuple[str, str]:
        if not payload:
            raise DomainError("audio file cannot be empty")
        if len(payload) > MAX_AUDIO_BYTES:
            raise DomainError(f"audio file cannot exceed {MAX_AUDIO_BYTES} bytes")
        clean_name = PurePath(filename).name.strip()
        if not clean_name or len(clean_name) > 255:
            raise DomainError("audio filename is invalid")

        detected_type = GameAudioService._detect_content_type(payload)
        accepted_types = {
            "audio/ogg": "audio/ogg",
            "application/ogg": "audio/ogg",
            "audio/mpeg": "audio/mpeg",
            "audio/mp3": "audio/mpeg",
            "audio/wav": "audio/wav",
            "audio/x-wav": "audio/wav",
        }
        normalized_type = (content_type or "").lower()
        if normalized_type not in {"", "application/octet-stream", *accepted_types}:
            raise DomainError("only OGG, MP3, and WAV audio files are supported")
        declared_type = accepted_types.get(normalized_type)
        if declared_type is not None and declared_type != detected_type:
            raise DomainError("audio content does not match its declared type")
        return clean_name, detected_type

    @staticmethod
    def _detect_content_type(payload: bytes) -> str:
        if payload.startswith(b"OggS"):
            return "audio/ogg"
        if payload.startswith(b"ID3") or (
            len(payload) >= 2 and payload[0] == 0xFF and payload[1] & 0xE0 == 0xE0
        ):
            return "audio/mpeg"
        if len(payload) >= 12 and payload.startswith(b"RIFF") and payload[8:12] == b"WAVE":
            return "audio/wav"
        raise DomainError("only OGG, MP3, and WAV audio files are supported")
