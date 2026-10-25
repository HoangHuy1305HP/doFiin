from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from app import auth, portfolios
from app.analytics.routes import router as analytics_router
from app.config import Settings, get_settings
from app.db import make_engine, make_session_factory


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(
        title="doFiin Backend",
        version="0.2.0",
        description="Demo 1: accounts, versioned portfolios, analytics, backtests and web UI.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        detail = (
            exc.detail
            if isinstance(exc.detail, dict)
            else {
                "code": "HTTP_ERROR",
                "message": str(exc.detail),
            }
        )
        headers = dict(exc.headers or {})
        if exc.status_code == 401:
            headers["WWW-Authenticate"] = "Bearer"
        return JSONResponse(status_code=exc.status_code, content={"error": detail}, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # Never echo input/password/token values back into validation errors.
        issues = [
            {"location": list(error["loc"]), "message": error["msg"], "type": error["type"]}
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid request.",
                    "issues": issues,
                },
            },
        )

    @app.middleware("http")
    async def private_response_headers(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/health", tags=["Health"])
    def health():
        return {"status": "ok", "phase": 2, "demo": 1}

    @app.get("/ready", tags=["Health"])
    def ready():
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return {"status": "ready"}
        except SQLAlchemyError:
            return JSONResponse(
                status_code=503,
                content={
                    "error": {"code": "DATABASE_UNAVAILABLE", "message": "Database unavailable."},
                },
            )

    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(portfolios.router, prefix="/api/v1")
    app.include_router(analytics_router, prefix="/api/v1")
    web_dist = Path(__file__).resolve().parents[1] / "web" / "dist"
    if (web_dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=web_dist / "assets"), name="web-assets")

    @app.get("/", include_in_schema=False)
    def web_index():
        if (web_dist / "index.html").exists():
            return FileResponse(web_dist / "index.html", headers={"Cache-Control": "no-cache"})
        return {
            "message": "Build web with npm run build in web/, then restart API.",
            "api_docs": "/docs",
        }

    return app
