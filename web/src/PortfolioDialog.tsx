import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';
import { Check, Clock3, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { api, dateLabel, post } from './api';
import AssetPicker from './AssetPicker';
import type { Instrument, Portfolio, Version } from './types';

const parseWeight = (value: string) => Number(value.replace(',', '.'));
const formatWeight = (value: number) => value.toLocaleString('vi-VN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const defaultPurchaseDate = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return localDate(date);
};
const usd = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);

export function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLElement>(null);
  useDialogFocus(modalRef, onClose);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section ref={modalRef} role="dialog" aria-modal="true" aria-label={title} className="modal">
        <header>
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function PortfolioDialog({
  portfolio,
  instruments,
  onSaved,
  onClose,
}: {
  portfolio: Portfolio | null;
  instruments: Instrument[];
  onSaved: (p: Portfolio) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(portfolio?.name || '');
  const [purchaseDate, setPurchaseDate] = useState(portfolio ? portfolio.latest_version.purchase_date || '' : defaultPurchaseDate());
  const [initialCapital, setInitialCapital] = useState(portfolio?.latest_version.initial_capital || '10000.00');
  const [rows, setRows] = useState(
    portfolio
      ? portfolio.latest_version.allocations.map((a) => ({
          id: a.instrument_id,
          symbol: a.symbol,
          weight: formatWeight(Number(a.weight) * 100),
        }))
      : instruments
          .filter((i) => ['AAPL', 'MSFT'].includes(i.symbol))
          .map((i) => ({ id: i.id, symbol: i.symbol, weight: '50,00' })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const totalCents = rows.reduce((sum, row) => sum + (Math.round(parseWeight(row.weight || '0') * 100) || 0), 0);
  const total = totalCents / 100;
  const capital = parseWeight(initialCapital);
  const cashAmount = Number.isFinite(capital) ? capital * Math.max(0, 1 - totalCents / 10000) : NaN;
  async function save() {
    setError('');
    if ((!portfolio && !purchaseDate) || (purchaseDate && (purchaseDate < '2018-01-01' || purchaseDate > localDate(new Date())))) {
      setError('Choose a purchase date between 2018 and today.');
      return;
    }
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(initialCapital) || !Number.isFinite(capital) || capital <= 0 || capital > 1_000_000_000) {
      setError('Starting capital must be greater than $0 and no more than $1,000,000,000.');
      return;
    }
    if (
      !rows.length ||
      rows.some(
        (row) => !row.id || !/^\d+(?:[.,]\d{1,2})?$/.test(row.weight) || parseWeight(row.weight) <= 0,
      ) ||
      totalCents <= 0 || totalCents > 10000
    ) {
      setError('Each weight must be greater than 0 and the total must not exceed 100%.');
      return;
    }
    if (new Set(rows.map((row) => row.id)).size !== rows.length) {
      setError('Choose each asset only once.');
      return;
    }
    setBusy(true);
    try {
      const cents = rows.map((row) => Math.round(parseWeight(row.weight) * 100));
      const allocations = rows.map((row, i) => ({
        instrument_id: row.id,
        weight: (cents[i] / 10000).toFixed(10),
      }));
      const result = portfolio
        ? await api<Portfolio>('/portfolios/' + portfolio.id + '/configuration', {
            method: 'PUT',
            body: JSON.stringify({ expected_version: portfolio.current_version, purchase_date: purchaseDate || null, initial_capital: capital.toFixed(2), allocations }),
          })
        : await post<Portfolio>('/portfolios', { name, base_currency: 'USD', purchase_date: purchaseDate, initial_capital: capital.toFixed(2), allocations });
      await onSaved(result);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save portfolio.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={portfolio ? 'Portfolio settings' : 'Create portfolio'}
      subtitle={
        portfolio
          ? 'Saving creates a new version and preserves your history.'
          : 'Choose assets and set your weights to get started.'
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Portfolio name
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            disabled={!!portfolio}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Default"
          />
        </label>
        <label>
          Purchase date
          <input type="date" min="2018-01-01" max={localDate(new Date())} required={!portfolio}
            value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
        </label>
        <label>
          Starting capital (USD)
          <input type="text" inputMode="decimal" value={initialCapital}
            onChange={(event) => setInitialCapital(event.target.value)}
            onBlur={() => { if (Number.isFinite(capital) && capital > 0) setInitialCapital(capital.toFixed(2)); }} />
        </label>
        <p className="small-note">Chỉ chọn tài sản đang giao dịch trên Alpaca và có giá IEX trong 30 ngày gần đây.
          Tìm theo mã hoặc tên công ty. Lịch sử giá tại ngày mua vẫn cần được kiểm tra khi phân tích.</p>
        <div className="allocation-editor-heading">
          <span>Asset</span>
          <span>Weight (%)</span>
        </div>
        <div className="allocation-editor">
          {rows.map((row, index) => (
            <div className="allocation-editor-row" key={index}>
              <AssetPicker
                label={'Asset ' + (index + 1)}
                value={row.id}
                symbol={row.symbol}
                disabled={busy}
                excludedIds={rows.filter((_, i) => i !== index).map((item) => item.id)}
                onChange={(asset) => setRows((previous) => previous.map((item, i) =>
                  i === index ? { ...item, id: asset.id, symbol: asset.symbol } : item))}
              />
              <div className="percent-input">
                <input
                  aria-label={'Weight' + (index + 1)}
                  type="text"
                  inputMode="decimal"
                  value={row.weight}
                  onChange={(e) => {
                    if (/^\d{0,3}(?:[.,]\d{0,2})?$/.test(e.target.value))
                      setRows(rows.map((item, i) => i === index ? { ...item, weight: e.target.value } : item));
                  }}
                  onBlur={() => {
                    const value = parseWeight(row.weight);
                    if (row.weight && Number.isFinite(value))
                      setRows((previous) => previous.map((item, i) => i === index ? { ...item, weight: formatWeight(value) } : item));
                  }}
                />
                <span>%</span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={'Remove asset' + (index + 1)}
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <div className="allocation-editor-bottom">
          <button
            type="button"
            className="text-button"
            disabled={busy || rows.length >= 100}
            onClick={() =>
              setRows([
                ...rows,
                {
                  id: '',
                  symbol: '',
                  weight: '0,00',
                },
              ])
            }
          >
            <Plus size={15} />
            Add asset
          </button>
          <span className={'allocation-total ' + (total > 0 && total <= 100 ? 'valid' : '')}>
            {total > 0 && total <= 100 && <Check size={14} />}Assets{' '}
            {Number.isFinite(total)
              ? formatWeight(total)
              : '—'}
            %
          </span>
        </div>
        <p className="small-note">
          Remaining {Number.isFinite(total) ? formatWeight(Math.max(0, 100 - total)) : '—'}% stays as USD cash
          {Number.isFinite(cashAmount) ? ` (${usd(cashAmount)} at purchase)` : ''}. Asset weights are not normalized.
        </p>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button outline" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Save portfolio
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function HistoryDialog({
  portfolio,
  onView,
  onClose,
  actionLabel = 'View analysis →',
}: {
  portfolio: Portfolio;
  onView: (version: Version) => void;
  onClose: () => void;
  actionLabel?: string;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Version[]>('/portfolios/' + portfolio.id + '/versions')
      .then(setVersions)
      .catch((e) => setError(e.message));
  }, [portfolio.id]);
  async function view(number: number) {
    try {
      const version = await api<Version>('/portfolios/' + portfolio.id + '/versions/' + number);
      onView(version);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load version.');
    }
  }
  return (
    <Modal
      title="Version history"
      subtitle={portfolio.name + '· Each version preserves its saved weights.'}
      onClose={onClose}
    >
      <div className="history-list">
        {versions.map((version) => (
          <button key={version.id} onClick={() => void view(version.version_number)}>
            <span className="history-icon">
              <Clock3 size={18} />
            </span>
            <span>
              <strong>
                Version {version.version_number}
                {version.version_number === portfolio.current_version ? '· Current' : ''}
              </strong>
              <small>
                {dateLabel(version.created_at.slice(0, 10))} ·{' '}
                {new Date(version.created_at).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </small>
            </span>
            <span className="text-button">{actionLabel}</span>
          </button>
        ))}
      </div>
      {error && <div className="inline-error">{error}</div>}
      <p className="small-note">Viewing a version does not change your current configuration.</p>
    </Modal>
  );
}
export function RenameDialog({
  portfolio,
  onSaved,
  onClose,
}: {
  portfolio: Portfolio;
  onSaved: (p: Portfolio) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(portfolio.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const result = await api<Portfolio>('/portfolios/' + portfolio.id, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          description: portfolio.description,
          expected_version: portfolio.current_version,
        }),
      });
      await onSaved(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to rename.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Rename portfolio" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          Portfolio name
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="small-note">
          Create a new version with the same weights to preserve changes from other devices.
        </p>
        {error && <div className="inline-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button outline" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            Save name
          </button>
        </div>
      </form>
    </Modal>
  );
}
