from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status

from business_game.api.dependencies import (
    get_board_project_service,
    get_current_user,
)
from business_game.application.board_service import BoardProjectService
from business_game.domain.board_models import (
    BoardDraft,
    BoardProjectCreate,
    BoardProjectUpdate,
    BoardRevisionRequest,
    BoardValidationResult,
    PublishBoardRequest,
    PublishedBoardVersion,
)
from business_game.domain.models import User

router = APIRouter(prefix="/api/v1/board-projects", tags=["board-projects"])


@router.get("", response_model=list[BoardDraft])
async def list_board_projects(
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[
        BoardProjectService,
        Depends(get_board_project_service),
    ],
) -> list[BoardDraft]:
    return await projects.list(current_user.id)


@router.post(
    "",
    response_model=BoardDraft,
    status_code=status.HTTP_201_CREATED,
)
async def create_board_project(
    data: BoardProjectCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[
        BoardProjectService,
        Depends(get_board_project_service),
    ],
) -> BoardDraft:
    return await projects.create(current_user.id, data)


@router.get("/{project_id}", response_model=BoardDraft)
async def get_board_project(
    project_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[
        BoardProjectService,
        Depends(get_board_project_service),
    ],
) -> BoardDraft:
    return await projects.get(project_id, current_user.id)


@router.patch("/{project_id}", response_model=BoardDraft)
async def update_board_project(
    project_id: UUID,
    data: BoardProjectUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[
        BoardProjectService,
        Depends(get_board_project_service),
    ],
) -> BoardDraft:
    return await projects.update(project_id, current_user.id, data)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_board_project(
    project_id: UUID,
    revision: Annotated[int, Query(ge=1)],
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[
        BoardProjectService,
        Depends(get_board_project_service),
    ],
) -> Response:
    await projects.delete(project_id, current_user.id, revision)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/validate", response_model=BoardValidationResult)
async def validate_board_project(
    project_id: UUID,
    data: BoardRevisionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[
        BoardProjectService,
        Depends(get_board_project_service),
    ],
) -> BoardValidationResult:
    return await projects.validate(project_id, current_user.id, data.revision)


@router.post(
    "/{project_id}/publish",
    response_model=PublishedBoardVersion,
    status_code=status.HTTP_201_CREATED,
)
async def publish_board_project(
    project_id: UUID,
    data: PublishBoardRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[
        BoardProjectService,
        Depends(get_board_project_service),
    ],
) -> PublishedBoardVersion:
    return await projects.publish(project_id, current_user.id, data)


@router.get(
    "/{project_id}/versions",
    response_model=list[PublishedBoardVersion],
)
async def list_board_versions(
    project_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[
        BoardProjectService,
        Depends(get_board_project_service),
    ],
) -> list[PublishedBoardVersion]:
    return await projects.list_versions(project_id, current_user.id)
