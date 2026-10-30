import { useEffect, useState } from 'react';
import { api } from './api';
import { getLocale } from './i18n';
import { TimeChart } from './charts';
import type { Point } from './types';

export type IntradayRange = '1p' | '15p' | '30p' | '1d' | '3d';
export const INTRADAY_RANGES: { value: IntradayRange; label: string }[] = [
  { value: '1p', label: '1 minute' },
  { value: '15p', label: '15 minutes' },
  { value: '30p', label: '30 minutes' },
  { value: '1d', label: '1 calendar day' },
  { value: '3d', label: '3 calendar days' },
];
type Result = {
  series: Point[];
  as_of: string;
  window_start: string;
  stale: boolean;
  warnings: string[];
};

export default function IntradayGrowth({ runId, range, benchmark, area }: {
  runId: string; range: IntradayRange; benchmark: string; area: boolean;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setResult(null);
    setError('');
    setBusy(true);
    async function load() {
      try {
        const next = await api<Result>(`/analysis-runs/${runId}/intraday-growth?range=${range}`);
        if (active) { setResult(next); setError(''); }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load minute prices.');
      } finally {
        if (active) { setBusy(false); timer = setTimeout(load, 60_000); }
      }
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [runId, range, retry]);
  return (
    <div className="intraday-growth">
      <div className="growth-meta">
        <span>{range} window · 1-minute prices<br />100 at window start</span>
        {result && <span>{result.series.length} minute points<br />{result.stale ? 'Last available session' : 'Latest available bars'}</span>}
      </div>
      {busy && <div className="growth-live-wait" role="status">Loading Alpaca IEX minute prices…</div>}
      {error && <div className="intraday-message" role="alert">
        {error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>
      </div>}
      {!busy && !error && result && <>
        <TimeChart data={result.series} timeScale="minute" area={area} lines={[
          { key: 'portfolio', name: 'Portfolio', color: 'var(--chart-accent, #0f172a)' },
          { key: 'benchmark', name: benchmark, color: '#64748b' },
        ]} />
        <p className="intraday-note">Data through {new Date(result.as_of).toLocaleString(getLocale())} · Device time zone · IEX regular sessions. Missing quotes carried forward for at most 5 minutes.</p>
        <details className="intraday-note">
          <summary>Chart assumptions and data status</summary>
          <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      </>}
    </div>
  );
}
