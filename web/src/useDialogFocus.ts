import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export function useDialogFocus(root: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]',
        ) || [],
      ).filter((item) => item.getClientRects().length > 0);
    const animation = requestAnimationFrame(() => {
      const input = root.current?.querySelector<HTMLInputElement>('input:not([disabled])');
      (input || focusable()[0])?.focus();
    });
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      cancelAnimationFrame(animation);
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [root]);
}
