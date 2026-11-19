import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import sessionmaker

from .config import Settings
from .database import Base, make_engine
from .routers import movements, products, reports, suppliers
from .seed import seed_if_empty

logger = logging.getLogger("inventory")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    engine = make_engine(settings.database_url)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        Base.metadata.create_all(engine)
        if settings.seed_demo_data:
            with session_factory() as session:
                if seed_if_empty(session):
                    logger.info("Database was empty, loaded demo data")
        yield
        engine.dispose()

    app = FastAPI(
        title="Inventory Manager API",
        description="Products, suppliers, stock movements, low-stock alerts and reports.",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.state.session_factory = session_factory

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix="/api")
    for module in (products, movements, suppliers, reports):
        api.include_router(module.router)

    @api.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(api)
    return app


app = create_app()
