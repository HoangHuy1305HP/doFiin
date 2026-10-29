import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export type StudioSelectOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: StudioSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
};

export default function StudioSelect({ label, value, options, onChange, placeholder = 'Select an option' }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 260 });
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  const updatePosition = useCallback(() => {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const menuHeight = Math.min(options.length * 36 + 10, 260);
    const below = window.innerHeight - bounds.bottom - 8;
    const above = bounds.top - 8;
    const openAbove = below < menuHeight && above > below;
    const available = openAbove ? above : below;
    const height = Math.min(menuHeight, Math.max(80, available));
    setPosition({
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - bounds.width - 8)),
      top: openAbove ? bounds.top - height - 4 : bounds.bottom + 4,
      width: bounds.width,
      maxHeight: height,
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function show(index = selectedIndex >= 0 ? selectedIndex : 0) {
    if (!options.length) return;
    setActiveIndex(index);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      show(event.key === 'ArrowDown' ? Math.max(0, selectedIndex) : selectedIndex < 0 ? options.length - 1 : selectedIndex);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      show(event.key === 'Home' ? 0 : options.length - 1);
    }
  }

  function onOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      const focusable = Array.from(
        rootRef.current?.closest('.modal, .studio-shell')?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]',
        ) || [],
      ).filter((element) => element.getClientRects().length > 0 && !menuRef.current?.contains(element));
      const triggerIndex = focusable.indexOf(triggerRef.current!);
      const nextIndex = (triggerIndex + (event.shiftKey ? focusable.length - 1 : 1)) % focusable.length;
      focusable[nextIndex]?.focus();
    }
  }

  const portalRoot = triggerRef.current?.closest('.modal, .studio-shell') || document.body;

  return (
    <div className="studio-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="studio-select-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-value={value}
        onClick={() => open ? setOpen(false) : show()}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{selected?.label || placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          id={listId}
          ref={menuRef}
          className="studio-select-menu"
          role="listbox"
          aria-label={label}
          style={position}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="studio-select-option"
              onClick={() => choose(index)}
              onKeyDown={(event) => onOptionKeyDown(event, index)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>,
        portalRoot,
      )}
    </div>
  );
}
