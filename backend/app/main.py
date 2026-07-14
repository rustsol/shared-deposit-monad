"""FastAPI application entry point.

Importing this module opens no database connection and requires no reachable
MySQL: configuration and engines resolve lazily inside request handlers.
CORS is locked to the single configured frontend origin with credentials, and
the only request logger applies invitation-token redaction (app/middleware.py).
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as v1_router
from app.auth.dependencies import CSRF_HEADER
from app.middleware import access_log_middleware

app = FastAPI(
    title="Shared Deposit API",
    version="0.1.0",
)

app.middleware("http")(access_log_middleware)

app.add_middleware(
    CORSMiddleware,
    # Resolved from the environment at import is avoided deliberately: the
    # value must be stable for the app's lifetime, so read it once via env
    # with the documented local default (Settings validates it at request time).
    allow_origins=[os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173").rstrip("/")],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", CSRF_HEADER],
)

app.include_router(v1_router)
