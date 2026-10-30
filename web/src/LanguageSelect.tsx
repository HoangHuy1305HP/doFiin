import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe2 } from 'lucide-react';
import { useLanguage } from './i18n';

const options = [
  { value: 'vi', label: 'Tiếng Việt', flag: '🇻🇳', short: 'VI' },
  { value: 'en', label: 'English', flag: '🇺🇸', short: 'EN' },
] as const;

export default function LanguageSelect() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === language);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    optionRefs.current[selectedIndex]?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, selectedIndex]);

  function choose(value: 'vi' | 'en') {
    setLanguage(value);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div className="language-select" ref={root}>
      <button
        ref={trigger}
        className="language-select-trigger"
        type="button"
        aria-label="Ngôn ngữ giao diện"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Globe2 size={17} aria-hidden="true" />
        <span className="language-select-label">{selected.label}</span>
        <span className="language-select-short">{selected.short}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="language-select-menu" role="listbox" aria-label="Ngôn ngữ giao diện">
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              className="language-select-option"
              type="button"
              role="option"
              aria-selected={language === option.value}
              onClick={() => choose(option.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const next = (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
                  optionRefs.current[next]?.focus();
                }
                if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault();
                  optionRefs.current[event.key === 'Home' ? 0 : options.length - 1]?.focus();
                }
              }}
            >
              <span aria-hidden="true">{option.flag}</span>
              <span>{option.label}</span>
              {language === option.value && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
