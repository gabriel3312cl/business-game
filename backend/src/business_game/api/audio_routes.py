from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status

from business_game.api.dependencies import get_game_audio_service, require_admin
from business_game.application.audio_service import MAX_AUDIO_BYTES, GameAudioService
from business_game.domain.audio_models import GameAudioCatalogItem
from business_game.domain.models import User

catalog_router = APIRouter(prefix="/api/v1/audio", tags=["audio"])
admin_router = APIRouter(prefix="/api/v1/admin/audio", tags=["admin-audio"])


@catalog_router.get("/catalog", response_model=list[GameAudioCatalogItem])
async def list_game_audio_catalog(
    audio: Annotated[GameAudioService, Depends(get_game_audio_service)],
) -> list[GameAudioCatalogItem]:
    return await audio.list_catalog()


@catalog_router.get("/{sound_id}")
async def get_game_audio(
    sound_id: str,
    audio: Annotated[GameAudioService, Depends(get_game_audio_service)],
) -> Response:
    record = await audio.get_content(sound_id)
    return Response(
        content=record.content,
        media_type=record.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "ETag": f'"{record.sha256}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@admin_router.get("", response_model=list[GameAudioCatalogItem])
async def list_admin_game_audio(
    _admin: Annotated[User, Depends(require_admin)],
    audio: Annotated[GameAudioService, Depends(get_game_audio_service)],
) -> list[GameAudioCatalogItem]:
    return await audio.list_catalog()


@admin_router.put("/{sound_id}", response_model=GameAudioCatalogItem)
async def replace_game_audio(
    sound_id: str,
    file: Annotated[UploadFile, File()],
    admin: Annotated[User, Depends(require_admin)],
    audio: Annotated[GameAudioService, Depends(get_game_audio_service)],
) -> GameAudioCatalogItem:
    payload = await file.read(MAX_AUDIO_BYTES + 1)
    return await audio.replace(
        sound_id,
        filename=file.filename or "",
        content_type=file.content_type,
        payload=payload,
        updated_by=admin.id,
    )


@admin_router.delete("/{sound_id}", status_code=status.HTTP_204_NO_CONTENT)
async def reset_game_audio(
    sound_id: str,
    _admin: Annotated[User, Depends(require_admin)],
    audio: Annotated[GameAudioService, Depends(get_game_audio_service)],
) -> Response:
    await audio.reset(sound_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
