from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert

from app.alpaca_assets import AlpacaAssetPage, CatalogUnavailable
from app.default_profiles import ensure_default_profiles
from app.dependencies import DB, CurrentIdentity
from app.errors import fail
from app.models import Instrument, Portfolio, PortfolioAllocation, PortfolioVersion, utcnow
from app.schemas import (
    AllocationOutput,
    ConfigurationUpdate,
    InstrumentOutput,
    MetadataUpdate,
    PortfolioCreate,
    PortfolioDetail,
    PortfolioSummary,
    VersionOutput,
    VersionSummary,
)

router = APIRouter(tags=["Portfolios"])


def owned_portfolio(db, portfolio_id, user_id):
    portfolio = db.scalar(
        select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user_id)
    )
    if portfolio is None:
        fail(404, "PORTFOLIO_NOT_FOUND", "Portfolio not found.")
    return portfolio


def validate_instruments(db, allocations, catalog):
    ids = {item.instrument_id for item in allocations}
    instruments = list(
        db.scalars(
            select(Instrument).where(
                Instrument.id.in_(ids), Instrument.is_active.is_(True), Instrument.currency == "USD"
            )
        )
    )
    if {item.id for item in instruments} != ids:
        fail(422, "INVALID_INSTRUMENT", "All instruments must be active USD instruments.")
    symbols = {item.symbol for item in instruments}
    try:
        supported = catalog.supported(symbols)
    except CatalogUnavailable as error:
        fail(503, "ALPACA_UNAVAILABLE", str(error))
    missing = sorted(symbols - supported)
    if missing:
        fail(
            422,
            "UNSUPPORTED_ALPACA_ASSET",
            "Không lấy được giá IEX gần đây hoặc mã không còn giao dịch trên Alpaca: "
            + ", ".join(missing),
        )


def save_version(db, portfolio_id, number, allocations, purchase_date=None, initial_capital=None):
    version = PortfolioVersion(
        portfolio_id=portfolio_id,
        version_number=number,
        purchase_date=purchase_date,
        initial_capital=initial_capital,
    )
    db.add(version)
    db.flush()
    db.add_all(
        [
            PortfolioAllocation(
                portfolio_version_id=version.id,
                instrument_id=item.instrument_id,
                weight=item.weight,
            )
            for item in allocations
        ]
    )
    db.flush()
    return version


def version_output(db, version):
    rows = db.execute(
        select(PortfolioAllocation, Instrument.symbol)
        .join(Instrument, Instrument.id == PortfolioAllocation.instrument_id)
        .where(PortfolioAllocation.portfolio_version_id == version.id)
        .order_by(Instrument.symbol)
    ).all()
    return VersionOutput(
        id=version.id,
        version_number=version.version_number,
        created_at=version.created_at,
        purchase_date=version.purchase_date,
        initial_capital=version.initial_capital,
        allocations=[
            AllocationOutput(instrument_id=row.instrument_id, symbol=symbol, weight=row.weight)
            for row, symbol in rows
        ],
    )


def detail_output(db, portfolio):
    version = db.scalar(
        select(PortfolioVersion).where(
            PortfolioVersion.portfolio_id == portfolio.id,
            PortfolioVersion.version_number == portfolio.current_version,
        )
    )
    return PortfolioDetail(
        **PortfolioSummary.model_validate(portfolio).model_dump(),
        latest_version=version_output(db, version),
    )


@router.get("/instruments", response_model=list[InstrumentOutput], tags=["Instruments"])
def instruments(
    db: DB,
    identity: CurrentIdentity,
    query: str = Query(default="", max_length=100),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    statement = select(Instrument).where(Instrument.is_active.is_(True))
    if query.strip():
        # Literal substring matching: '%' and '_' do not become search wildcards.
        statement = statement.where(
            or_(
                func.lower(Instrument.symbol).contains(query.strip().lower(), autoescape=True),
                func.lower(Instrument.name).contains(query.strip().lower(), autoescape=True),
            )
        )
    return list(db.scalars(statement.order_by(Instrument.symbol).limit(limit).offset(offset)))


@router.get("/instruments/alpaca", response_model=AlpacaAssetPage, tags=["Instruments"])
def alpaca_instruments(
    request: Request,
    db: DB,
    identity: CurrentIdentity,
    query: str = Query(default="", max_length=100),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0, le=100000),
):
    try:
        assets, next_offset, checked_at = request.app.state.alpaca_assets.search(
            query, limit, offset
        )
    except CatalogUnavailable as error:
        fail(503, "ALPACA_UNAVAILABLE", str(error))
    result = []
    for asset in assets:
        # Reuse existing IDs (notably SPY / NYSE_ARCA) so saved versions remain valid.
        existing = db.scalar(
            select(Instrument)
            .where(Instrument.symbol == asset["symbol"], Instrument.currency == "USD")
            .order_by(Instrument.id)
        )
        exchange = (
            existing.exchange
            if existing
            else {"ARCA": "NYSE_ARCA"}.get(asset["exchange"], asset["exchange"])
        )
        values = dict(
            symbol=asset["symbol"],
            name=(asset.get("name") or asset["symbol"])[:255],
            exchange=exchange,
            asset_type=existing.asset_type if existing else "STOCK",
            currency="USD",
            provider="alpaca",
            provider_symbol=asset["symbol"],
            is_active=True,
        )
        statement = insert(Instrument).values(**values)
        statement = statement.on_conflict_do_update(
            index_elements=["exchange", "symbol"],
            set_={key: values[key] for key in ("name", "provider", "provider_symbol", "is_active")},
        ).returning(Instrument)
        result.append(db.scalar(statement.execution_options(populate_existing=True)))
    db.commit()
    return AlpacaAssetPage(
        items=[InstrumentOutput.model_validate(item) for item in result],
        next_offset=next_offset,
        checked_at=checked_at,
    )


@router.post("/portfolios", response_model=PortfolioDetail, status_code=201)
def create_portfolio(data: PortfolioCreate, identity: CurrentIdentity, db: DB, request: Request):
    validate_instruments(db, data.allocations, request.app.state.alpaca_assets)
    portfolio = Portfolio(
        user_id=identity.user.id,
        name=data.name,
        description=data.description,
        base_currency=data.base_currency,
        current_version=1,
    )
    db.add(portfolio)
    db.flush()
    save_version(db, portfolio.id, 1, data.allocations, data.purchase_date, data.initial_capital)
    db.commit()
    return detail_output(db, portfolio)


@router.get("/portfolios", response_model=list[PortfolioSummary])
def list_portfolios(
    identity: CurrentIdentity,
    db: DB,
    include_archived: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    if ensure_default_profiles(db, identity.user.id):
        db.commit()
    statement = select(Portfolio).where(Portfolio.user_id == identity.user.id)
    if not include_archived:
        statement = statement.where(Portfolio.archived_at.is_(None))
    return list(
        db.scalars(
            statement.order_by(Portfolio.created_at.desc(), Portfolio.id)
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/portfolios/{portfolio_id}", response_model=PortfolioDetail)
def get_portfolio(portfolio_id: UUID, identity: CurrentIdentity, db: DB):
    return detail_output(db, owned_portfolio(db, portfolio_id, identity.user.id))


@router.put("/portfolios/{portfolio_id}/configuration", response_model=PortfolioDetail)
def update_configuration(
    portfolio_id: UUID,
    request: Request,
    data: ConfigurationUpdate,
    identity: CurrentIdentity,
    db: DB,
):
    portfolio = owned_portfolio(db, portfolio_id, identity.user.id)
    if portfolio.archived_at:
        fail(409, "PORTFOLIO_ARCHIVED", "Archived portfolio cannot be modified.")
    validate_instruments(db, data.allocations, request.app.state.alpaca_assets)
    # Atomic compare-and-swap guards simultaneous edits on web/mobile.
    changed = db.execute(
        update(Portfolio)
        .where(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == identity.user.id,
            Portfolio.current_version == data.expected_version,
            Portfolio.archived_at.is_(None),
        )
        .values(current_version=data.expected_version + 1, updated_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
        db.rollback()
        fail(409, "VERSION_CONFLICT", "Portfolio changed. Reload before saving.")
    previous = db.scalar(
        select(PortfolioVersion).where(
            PortfolioVersion.portfolio_id == portfolio_id,
            PortfolioVersion.version_number == data.expected_version,
        )
    )
    save_version(
        db,
        portfolio_id,
        data.expected_version + 1,
        data.allocations,
        data.purchase_date if data.purchase_date is not None else previous.purchase_date,
        data.initial_capital if data.initial_capital is not None else previous.initial_capital,
    )
    db.commit()
    db.refresh(portfolio)
    return detail_output(db, portfolio)


@router.patch("/portfolios/{portfolio_id}", response_model=PortfolioDetail)
def update_metadata(
    portfolio_id: UUID,
    data: MetadataUpdate,
    identity: CurrentIdentity,
    db: DB,
):
    portfolio = owned_portfolio(db, portfolio_id, identity.user.id)
    if portfolio.archived_at:
        fail(409, "PORTFOLIO_ARCHIVED", "Archived portfolio cannot be modified.")
    # Metadata changes also increment version so expected_version protects every edit.
    old_version = db.scalar(
        select(PortfolioVersion).where(
            PortfolioVersion.portfolio_id == portfolio_id,
            PortfolioVersion.version_number == data.expected_version,
        )
    )
    changed = db.execute(
        update(Portfolio)
        .where(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == identity.user.id,
            Portfolio.current_version == data.expected_version,
            Portfolio.archived_at.is_(None),
        )
        .values(
            name=data.name,
            description=data.description,
            current_version=data.expected_version + 1,
            updated_at=utcnow(),
        )
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
        db.rollback()
        fail(409, "VERSION_CONFLICT", "Portfolio changed. Reload before saving.")
    allocations = list(
        db.scalars(
            select(PortfolioAllocation).where(
                PortfolioAllocation.portfolio_version_id == old_version.id,
            )
        )
    )
    save_version(
        db,
        portfolio_id,
        data.expected_version + 1,
        allocations,
        old_version.purchase_date,
        old_version.initial_capital,
    )
    db.commit()
    db.refresh(portfolio)
    return detail_output(db, portfolio)


@router.get("/portfolios/{portfolio_id}/versions", response_model=list[VersionSummary])
def versions(
    portfolio_id: UUID,
    identity: CurrentIdentity,
    db: DB,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    owned_portfolio(db, portfolio_id, identity.user.id)
    return list(
        db.scalars(
            select(PortfolioVersion)
            .where(PortfolioVersion.portfolio_id == portfolio_id)
            .order_by(PortfolioVersion.version_number.desc())
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/portfolios/{portfolio_id}/versions/{number}", response_model=VersionOutput)
def get_version(portfolio_id: UUID, number: int, identity: CurrentIdentity, db: DB):
    owned_portfolio(db, portfolio_id, identity.user.id)
    version = db.scalar(
        select(PortfolioVersion).where(
            PortfolioVersion.portfolio_id == portfolio_id,
            PortfolioVersion.version_number == number,
        )
    )
    if version is None:
        fail(404, "VERSION_NOT_FOUND", "Portfolio version not found.")
    return version_output(db, version)


@router.post("/portfolios/{portfolio_id}/archive", response_model=PortfolioSummary)
def archive(portfolio_id: UUID, identity: CurrentIdentity, db: DB):
    portfolio = owned_portfolio(db, portfolio_id, identity.user.id)
    # Same row is locked by configuration's atomic UPDATE; preserve history.
    db.execute(
        update(Portfolio)
        .where(
            Portfolio.id == portfolio_id,
            Portfolio.user_id == identity.user.id,
            Portfolio.archived_at.is_(None),
        )
        .values(archived_at=utcnow(), updated_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    db.commit()
    db.refresh(portfolio)
    return portfolio
