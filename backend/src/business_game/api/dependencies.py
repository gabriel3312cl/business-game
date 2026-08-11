from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from business_game.application.admin_service import AdminService
from business_game.application.audio_service import GameAudioService
from business_game.application.board_service import BoardProjectService, PackResolver
from business_game.application.pack_loader import PackLoader
from business_game.application.services import GameService, SessionService, UserService
from business_game.config import settings
from business_game.domain.errors import ForbiddenError, NotFoundError, UnauthorizedError
from business_game.domain.models import User, UserRole
from business_game.infrastructure.database import get_session
from business_game.infrastructure.repositories import UserRepository
from business_game.security import decode_access_token

pack_loader = PackLoader(settings.packs_dir)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


def get_user_service(
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
) -> UserService:
    return UserService(session)


def get_game_service(
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
) -> GameService:
    return GameService(
        session,
        pack_loader,
        pack_resolver=PackResolver(session, pack_loader),
    )


def get_board_project_service(
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
) -> BoardProjectService:
    return BoardProjectService(session)


def get_pack_resolver(
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
) -> PackResolver:
    return PackResolver(session, pack_loader)


def get_session_service(
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
) -> SessionService:
    return SessionService(session)


def get_game_audio_service(
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
) -> GameAudioService:
    return GameAudioService(session)


def get_admin_service(
    session: Annotated[AsyncSession, Depends(get_session, use_cache=False)],
) -> AdminService:
    return AdminService(session)


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    user_id = decode_access_token(token)
    try:
        return await UserRepository(session).get(user_id)
    except NotFoundError as exc:
        raise UnauthorizedError("invalid or inactive user") from exc


async def require_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role is not UserRole.ADMIN:
        raise ForbiddenError("administrator role is required")
    return current_user
