"""Versioned v1 API router."""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.drafts import router as drafts_router
from app.api.v1.invitations import router as invitations_router
from app.api.v1.system import router as system_router

router = APIRouter(prefix="/api/v1")
router.include_router(system_router)
router.include_router(auth_router)
router.include_router(invitations_router)
router.include_router(drafts_router)
