import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Search } from 'lucide-react';
import { api } from './api';
import type { Instrument } from './types';

type AssetPage = { items: Instrument[]; next_offset: number | null; feed: string; lookback_days: number };

export default function AssetPicker({ label, value, symbol, excludedIds, disabled, onChange }: {
  label: string; value: string; symbol: string; excludedIds: string[]; disabled?: boolean;
  onChange: (asset: Instrument) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(!value);
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<AssetPage>({ items: [], next_offset: null, feed: 'iex', lookback_days: 30 });
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (!open || disabled) return;
    let active = true;
    const controller = new AbortController();
    setBusy(true);
    setError('');
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ query: query.trim(), limit: '20', offset: String(cursor) });
      api<AssetPage>('/instruments/alpaca?' + params, { signal: controller.signal })
        .then((result) => {
          if (!active) return;
          setPage((previous) => cursor === 0 ? result : {
            ...result, items: [...previous.items, ...result.items.filter((item) => !previous.items.some((old) => old.id === item.id))],
          });
        })
        .catch((reason) => {
          if (active) setError(reason instanceof Error ? reason.message : 'Không tải được danh sách Alpaca.');
        })
        .finally(() => { if (active) setBusy(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [open, disabled, query, cursor, revision]);

  function restart() {
    setPage({ items: [], next_offset: null, feed: 'iex', lookback_days: 30 });
    setCursor(0);
    setRevision((previous) => previous + 1);
  }

  function focusOption(direction: number) {
    const options = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not([disabled])') || []);
    if (!options.length) return;
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    options[(current + direction + options.length) % options.length]?.focus();
  }

  return (
    <div ref={root} className="alpaca-picker" onKeyDownCapture={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
      }
    }}>
      <button ref={trigger} type="button" className="alpaca-picker-trigger" aria-label={label}
        aria-expanded={open} aria-controls={panelId} disabled={disabled}
        onClick={() => { if (!open) { setQuery(''); restart(); } setOpen(!open); }}>
        <span>{symbol || 'Chọn tài sản Alpaca'}</span><ChevronDown size={15} />
      </button>
      {open && <div id={panelId} className="alpaca-picker-panel">
        <div className="alpaca-picker-search">
          <input ref={input} type="search" maxLength={100} value={query} aria-label="Tìm mã hoặc tên tài sản"
            placeholder="Mã hoặc tên công ty…" disabled={disabled}
            onChange={(event) => { setQuery(event.target.value); restart(); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); restart(); }
              if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(1); }
            }} />
          <button type="button" aria-label="Tìm kiếm tài sản Alpaca" title="Tìm kiếm" disabled={disabled}
            onClick={restart}><Search size={17} /></button>
        </div>
        <p className="alpaca-picker-hint">Alpaca · đã có giá IEX gần đây</p>
        {error ? <div className="alpaca-picker-error" role="alert">{error}
          <button type="button" onClick={() => setRevision((previous) => previous + 1)}>Thử lại</button>
        </div> : <>
          <div className="alpaca-picker-options" role="listbox" aria-label="Tài sản Alpaca" aria-busy={busy}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); focusOption(event.key === 'ArrowDown' ? 1 : -1);
              }
            }}>
            {page.items.map((asset) => <button key={asset.id} type="button" role="option"
              aria-selected={asset.id === value} disabled={busy || !!disabled || excludedIds.includes(asset.id)}
              onClick={() => { onChange(asset); setOpen(false); trigger.current?.focus(); }}>
              <span><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
              {asset.id === value && <Check size={15} />}
              {excludedIds.includes(asset.id) && <small>Đã chọn</small>}
            </button>)}
          </div>
          {!busy && !page.items.length && <p className="alpaca-picker-hint">Không có mã phù hợp đã được xác nhận giá IEX.</p>}
          {page.next_offset !== null && <button type="button" className="text-button" disabled={busy || disabled}
            onClick={() => setCursor(page.next_offset!)}>Xem thêm</button>}
        </>}
        {busy && <p className="alpaca-picker-hint" role="status"><LoaderCircle className="spin" size={14} /> Đang kiểm tra Alpaca…</p>}
      </div>}
    </div>
  );
}
