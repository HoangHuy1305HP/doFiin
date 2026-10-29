import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { SectionAppearance } from './preferences';

type Background = SectionAppearance['background'];
const PALETTE: { label: string; value: Background; color: string }[] = [
  { label: 'White', value: 'white', color: '#ffffff' },
  { label: 'Mist', value: 'mist', color: '#f1f5f9' },
  { label: 'Sand', value: 'sand', color: '#f5f0e8' },
  { label: 'Pale blue', value: '#eaf0ff', color: '#eaf0ff' },
  { label: 'Sky', value: '#e8f5fb', color: '#e8f5fb' },
  { label: 'Mint', value: '#e8f6f0', color: '#e8f6f0' },
  { label: 'Lilac', value: '#f1edfb', color: '#f1edfb' },
  { label: 'Blush', value: '#fbeced', color: '#fbeced' },
  { label: 'Cream', value: '#fff6de', color: '#fff6de' },
  { label: 'Slate', value: '#334155', color: '#334155' },
  { label: 'Navy', value: '#172238', color: '#172238' },
  { label: 'Charcoal', value: '#202322', color: '#202322' },
];

function normalizeHex(input: string): `#${string}` | null {
  const value = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
  return null;
}

export default function StudioBackgroundPicker({ value, onChange }: { value: Background; onChange: (value: Background) => void }) {
  const [hex, setHex] = useState(value.startsWith('#') ? value.toUpperCase() : '');
  useEffect(() => setHex(value.startsWith('#') ? value.toUpperCase() : ''), [value]);
  const invalid = hex.length > 0 && !normalizeHex(hex);
  const customColor = value.startsWith('#') ? value : '#ffffff';

  return (
    <div className="studio-background-picker">
      <button
        type="button"
        className="studio-background-default"
        aria-pressed={value === 'default'}
        onClick={() => onChange('default')}
      >
        <span className="studio-background-default-icon" aria-hidden="true" />
        Default background
        {value === 'default' && <Check size={16} aria-hidden="true" />}
      </button>
      <div className="studio-background-palette" role="group" aria-label="Background color palette">
        {PALETTE.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-label={item.label}
            aria-pressed={value === item.value}
            title={item.label}
            className={value === item.value ? 'active' : ''}
            style={{ backgroundColor: item.color }}
            onClick={() => onChange(item.value)}
          >
            {value === item.value && <Check size={16} color={['#334155', '#172238', '#202322'].includes(item.color) ? '#fff' : '#172238'} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="studio-background-custom">
        <label htmlFor="studio-background-hex">Custom color</label>
        <div className="studio-background-custom-row">
          <input
            type="color"
            aria-label="Choose custom background color"
            value={customColor}
            onChange={(event) => onChange(event.target.value as Background)}
          />
          <input
            id="studio-background-hex"
            type="text"
            inputMode="text"
            spellCheck={false}
            maxLength={7}
            placeholder="#RRGGBB"
            aria-label="Background hex color"
            aria-invalid={!!invalid}
            value={hex}
            onChange={(event) => {
              const next = event.target.value;
              setHex(next);
              const color = normalizeHex(next);
              if (color) onChange(color);
            }}
            onBlur={() => {
              if (invalid) setHex(value.startsWith('#') ? value.toUpperCase() : '');
            }}
          />
        </div>
        {invalid && <span className="studio-background-error" role="alert">Enter a 6-digit HEX color.</span>}
      </div>
    </div>
  );
}
