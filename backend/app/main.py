"""FastAPI application entry point.

Importing this module opens no database connection and requires no reachable
MySQL: configuration and engines resolve lazily inside request handlers.
Product API routes (auth, drafts, invitations, evidence, claims) arrive in
later phases per docs/03_IMPLEMENTATION_PLAN.md.
"""

from fastapi import FastAPI

from app.api.v1 import router as v1_router

app = FastAPI(
    title="Shared Deposit API",
    version="0.1.0",
)
app.include_router(v1_router)
