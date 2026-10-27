import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';
import { Check, Clock3, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { api, dateLabel, post } from './api';
import type { Instrument, Portfolio, Version } from './types';

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
  const [rows, setRows] = useState(
    portfolio
      ? portfolio.latest_version.allocations.map((a) => ({
          id: a.instrument_id,
          weight: String(Number(a.weight) * 100),
        }))
      : instruments
          .filter((i) => ['AAPL', 'MSFT'].includes(i.symbol))
          .map((i) => ({ id: i.id, weight: '50' })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = rows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  async function save() {
    setError('');
    if (
      !rows.length ||
      rows.some(
        (row) => !row.id || !Number.isFinite(Number(row.weight)) || Number(row.weight) <= 0,
      ) ||
      Math.abs(total - 100) > 1e-8
    ) {
      setError('Each weight must be greater than 0 and the total must equal 100%.');
      return;
    }
    if (new Set(rows.map((row) => row.id)).size !== rows.length) {
      setError('Choose each asset only once.');
      return;
    }
    setBusy(true);
    try {
      const units = rows.map((row) => Math.round(Number(row.weight) * 1e8));
      units[units.indexOf(Math.max(...units))] += 1e10 - units.reduce((a, b) => a + b, 0);
      const allocations = rows.map((row, i) => ({
        instrument_id: row.id,
        weight: (units[i] / 1e10).toFixed(10),
      }));
      const result = portfolio
        ? await api<Portfolio>('/portfolios/' + portfolio.id + '/configuration', {
            method: 'PUT',
            body: JSON.stringify({ expected_version: portfolio.current_version, allocations }),
          })
        : await post<Portfolio>('/portfolios', { name, base_currency: 'USD', allocations });
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
            placeholder="e.g. Long-term portfolio"
          />
        </label>
        <div className="allocation-editor-heading">
          <span>Asset</span>
          <span>Weight (%)</span>
        </div>
        <div className="allocation-editor">
          {rows.map((row, index) => (
            <div className="allocation-editor-row" key={index}>
              <select
                aria-label={'Asset' + (index + 1)}
                value={row.id}
                onChange={(e) =>
                  setRows(
                    rows.map((item, i) => (i === index ? { ...item, id: e.target.value } : item)),
                  )
                }
              >
                {instruments.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.symbol} · {asset.name}
                  </option>
                ))}
              </select>
              <div className="percent-input">
                <input
                  aria-label={'Weight' + (index + 1)}
                  type="number"
                  step="any"
                  min="0.000001"
                  max={100}
                  value={row.weight}
                  onChange={(e) =>
                    setRows(
                      rows.map((item, i) =>
                        i === index ? { ...item, weight: e.target.value } : item,
                      ),
                    )
                  }
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
            disabled={rows.length >= instruments.length}
            onClick={() =>
              setRows([
                ...rows,
                {
                  id:
                    instruments.find((asset) => !rows.some((row) => row.id === asset.id))?.id || '',
                  weight: '0',
                },
              ])
            }
          >
            <Plus size={15} />
            Add asset
          </button>
          <span className={'allocation-total ' + (Math.abs(total - 100) < 1e-8 ? 'valid' : '')}>
            {Math.abs(total - 100) < 1e-8 && <Check size={14} />}Total{' '}
            {Number.isFinite(total)
              ? total.toLocaleString('vi-VN', { maximumFractionDigits: 6 })
              : '—'}
            %
          </span>
        </div>
        <p className="small-note">
          Simulated portfolio · USD · Long only · Weights are not automatically normalized.
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
}: {
  portfolio: Portfolio;
  onView: (version: Version) => void;
  onClose: () => void;
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
            <span className="text-button">View analysis →</span>
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
