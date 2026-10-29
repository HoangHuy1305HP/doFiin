"""Create the two editable starting portfolios for an account."""

from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select

from app.models import Instrument, Portfolio, PortfolioAllocation, PortfolioVersion, utcnow


def ensure_default_profiles(db, user_id):
    existing = list(db.scalars(select(Portfolio).where(Portfolio.user_id == user_id)))
    changed = False
    if existing and not any(portfolio.profile_role == "default" for portfolio in existing):
        candidates = [
            portfolio
            for portfolio in existing
            if portfolio.archived_at is None
            and portfolio.profile_role != "benchmark"
            and portfolio.name != "Benchmark"
        ]
        if candidates:
            chosen = min(candidates, key=lambda item: (item.name != "Default", item.created_at))
            chosen.profile_role = "default"
            changed = True
    benchmark_exists = any(
        portfolio.profile_role == "benchmark" or portfolio.name == "Benchmark"
        for portfolio in existing
    )
    # Existing users keep their own portfolios. A fresh user receives two profiles.
    specs = []
    if not existing:
        specs.append(("Default", "default", {"AAPL": "0.45", "MSFT": "0.35", "NVDA": "0.20"}))
    if not benchmark_exists:
        specs.append(("Benchmark", "benchmark", {"SPY": "1.00"}))
    if not specs:
        return changed
    symbols = {symbol for _, _, weights in specs for symbol in weights}
    instruments = {
        instrument.symbol: instrument
        for instrument in db.scalars(
            select(Instrument).where(
                Instrument.symbol.in_(symbols),
                Instrument.currency == "USD",
                Instrument.is_active.is_(True),
            )
        )
    }
    if symbols - instruments.keys():
        raise RuntimeError("Seed the instrument catalog before creating account profiles.")
    purchase_date = (utcnow() - timedelta(days=365)).date()
    for name, role, weights in specs:
        portfolio = Portfolio(
            user_id=user_id,
            name=name,
            description="Editable starting profile",
            profile_role=role,
        )
        db.add(portfolio)
        db.flush()
        version = PortfolioVersion(
            portfolio_id=portfolio.id,
            version_number=1,
            purchase_date=purchase_date,
            initial_capital=Decimal("10000.00"),
        )
        db.add(version)
        db.flush()
        db.add_all(
            PortfolioAllocation(
                portfolio_version_id=version.id,
                instrument_id=instruments[symbol].id,
                weight=Decimal(weight),
            )
            for symbol, weight in weights.items()
        )
    db.flush()
    return True
