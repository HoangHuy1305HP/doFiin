import type { Page } from './types';
export const DEFAULT_MENU: Page[] = ['portfolio', 'risk', 'signals', 'backtest', 'factors'];
export const PAGE_LABELS: Record<Page, string> = {
  portfolio: 'Portfolio',
  risk: 'Risk',
  signals: 'Signals',
  backtest: 'Backtest',
  factors: 'Factors',
};
export type Presentation = { color: string; legend: boolean; corners: number };
export type Preferences = { menu: Page[]; presentation: Presentation };
export const defaultPreferences = (): Preferences => ({
  menu: [...DEFAULT_MENU],
  presentation: { color: '#163d32', legend: true, corners: 0 },
});
export function readPreferences(userId: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem('dofiin:presentation:' + userId) || 'null');
    if (!value) return defaultPreferences();
    const menu = Array.isArray(value.menu)
      ? [...new Set<Page>(value.menu.filter((key: Page) => DEFAULT_MENU.includes(key)))]
      : DEFAULT_MENU;
    const color = /^#[0-9a-f]{6}$/i.test(value.presentation?.color)
      ? value.presentation.color
      : '#163d32';
    return {
      menu: menu.length ? menu : [...DEFAULT_MENU],
      presentation: {
        color,
        legend: value.presentation?.legend !== false,
        corners: [0, 4, 8, 12].includes(value.presentation?.corners)
          ? value.presentation.corners
          : 0,
      },
    };
  } catch {
    return defaultPreferences();
  }
}
