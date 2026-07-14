"""FastAPI application entry point.

Phase 1 scaffolding only: the application instance exists so tooling,
tests, and the dev server can run. API routes, configuration loading,
database access, and the chain worker are added in later phases per
docs/03_IMPLEMENTATION_PLAN.md.
"""

from fastapi import FastAPI

app = FastAPI(
    title="Shared Deposit API",
    version="0.1.0",
)
