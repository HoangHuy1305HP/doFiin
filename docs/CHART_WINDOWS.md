# Portfolio minute windows — 30 October 2026

Implemented locally on branch `thanh`; no GitHub push or deployment performed.

- Buttons `1p`, `15p`, `30p`, `1d`, `3d` select trailing chart windows, not bar aggregation intervals.
- All five use Alpaca IEX adjusted **one-minute bars**, regular New York session 09:30–16:00. The incomplete current minute is excluded.
- The window ends at the most recent common available minute. When older than five minutes, the chart explicitly shows last-available-session status. One and three days mean calendar days, not a guaranteed number of trading sessions.
- Original profile holdings and idle cash are valued using the analysis snapshot's adjusted base prices. Each resulting profile is then rebased to 100 at the first available point of the selected window. This does not rebalance holdings.
- Missing quotes may carry forward for at most five elapsed minutes. No future/backward filling. Missing common history and provider failures are reported explicitly; no synthetic fallback.
- Minute windows affect the growth chart only. The existing daily period (1M/3M/6M/1Y/3Y) remains the basis for daily KPIs, other widgets, backtests and CSV export. A visible note explains the distinction.
- The existing `1s` button remains a browser-session live-sample view, not stored one-second historical bars.
- Per-process minute cache: 60-second TTL, at most eight symbol sets. Browser refresh: once per minute; API keys remain server-side. No DB migration or new package required.

## Main code

- `app/analytics/intraday.py`: provider pagination, bounded cache, valuation and typed API response.
- `app/analytics/routes.py`: authenticated `GET /api/v1/analysis-runs/{run_id}/intraday-growth?range=15p` checks run ownership and source.
- `web/src/IntradayGrowth.tsx`: loading, retry, timestamps, chart and assumptions.
- `web/src/App.tsx`, `pages.tsx`, `Studio.tsx`, `charts.tsx`, `styles.css`: controls, Studio preview, timestamp axes and mobile wrapping.

## Verification

- Production TypeScript/Vite build passed.
- Full test suite with native PostgreSQL: **65 passed** (one existing Starlette/httpx deprecation warning).
- Live Alpaca request and authenticated HTTP QA passed for all five windows. At the QA time the latest data was the previous regular session; stale status was correctly reported.
- Observed HTTP output: 1p=2, 15p=16, 30p=31, 1d=391, 3d=1171 aligned points for the QA portfolio. Counts depend on availability and window endpoints.
- UI 15p rendered real minute data, scope note, last-session status and timestamps. Controls wrapped at mobile width.
- Existing frontend route test now explicitly reads UTF-8, fixing its platform-dependent Windows HTML comparison.

## Restart after this source update

Stop the old API terminal with Ctrl+C, then run `./START_DEMO.cmd` from `C:/Users/ASUS/Projects/doFiin-thanh` in Git Bash. Reload the browser with Ctrl+F5. The web build is already generated; do not run setup again.

## Proposed future work (not implemented in this update)

1. Portfolio simulation cloud and constrained efficient frontier: return/risk trade-offs, distinguishing sampled portfolios from the computed frontier.
2. Bull/neutral/bear strategy with lagged execution and the same fees/rebalancing assumptions as existing backtests.
3. Multiple factor proxies (SPY, QQQ, IWM, VIX), with distinct labeling for individual proxy sensitivity versus joint regression.
4. Out-of-sample/walk-forward evaluation: use past training data only, freeze weights for the test interval, compare with the same-cost baseline.
