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
export type ContentLocale = 'en-US' | 'vi-VN';
export type PageContent = { title: string; description: string };
export type Preferences = {
  menu: Page[];
  presentation: Presentation;
  locale: ContentLocale;
  content: Partial<Record<Page, Partial<Record<ContentLocale, PageContent>>>>;
};
export const defaultPreferences = (): Preferences => ({
  menu: [...DEFAULT_MENU],
  presentation: { color: '#163d32', legend: true, corners: 0 },
  locale: 'en-US',
  content: {},
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
      locale: value.locale === 'vi-VN' ? 'vi-VN' : 'en-US',
      content: Object.fromEntries(
        DEFAULT_MENU.map((page) => [
          page,
          Object.fromEntries(
            (['en-US', 'vi-VN'] as const).flatMap((locale) => {
              const item = value.content?.[page]?.[locale];
              return item && typeof item.title === 'string' && typeof item.description === 'string'
                ? [
                    [
                      locale,
                      {
                        title: item.title.slice(0, 120),
                        description: item.description.slice(0, 300),
                      },
                    ],
                  ]
                : [];
            }),
          ),
        ]),
      ),
    };
  } catch {
    return defaultPreferences();
  }
}
