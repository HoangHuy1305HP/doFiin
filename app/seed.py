from sqlalchemy import select

from app.config import get_settings
from app.db import make_engine, make_session_factory
from app.models import Instrument

SAMPLE_INSTRUMENTS = [
    ("AAPL", "Apple Inc.", "NASDAQ", "STOCK"),
    ("MSFT", "Microsoft Corporation", "NASDAQ", "STOCK"),
    ("NVDA", "NVIDIA Corporation", "NASDAQ", "STOCK"),
    ("SPY", "SPDR S&P 500 ETF Trust", "NYSE_ARCA", "ETF"),
]


def seed_instruments(db):
    for symbol, name, exchange, asset_type in SAMPLE_INSTRUMENTS:
        exists = db.scalar(
            select(Instrument.id).where(
                Instrument.exchange == exchange,
                Instrument.symbol == symbol,
            )
        )
        if exists is None:
            db.add(
                Instrument(
                    symbol=symbol,
                    name=name,
                    exchange=exchange,
                    asset_type=asset_type,
                    currency="USD",
                    provider="demo_catalog",
                    provider_symbol=symbol,
                    is_active=True,
                )
            )
    db.commit()


def main():
    engine = make_engine(get_settings().database_url)
    try:
        with make_session_factory(engine)() as db:
            seed_instruments(db)
        print("Seed complete: AAPL, MSFT, NVDA, SPY (catalog only; no market prices).")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
