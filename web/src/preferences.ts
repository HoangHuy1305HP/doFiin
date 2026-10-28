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
export type SectionAppearance = {
  width: 'stretch' | 'contained';
  height: 'auto' | 'medium' | 'large';
  spacing: 'compact' | 'comfortable' | 'spacious';
  background: 'default' | 'white' | 'mist' | 'sand';
  corners: 0 | 4 | 8 | 12;
};
export const DEFAULT_SECTION_APPEARANCE: SectionAppearance = {
  width: 'stretch',
  height: 'auto',
  spacing: 'comfortable',
  background: 'default',
  corners: 0,
};
export type ContentLocale = 'en-US' | 'vi-VN';
export type PageContent = { title: string; description: string };
export type Preferences = {
  menu: Page[];
  presentation: Presentation;
  sectionAppearance: Partial<Record<Page, Record<string, SectionAppearance>>>;
  locale: ContentLocale;
  content: Partial<Record<Page, Partial<Record<ContentLocale, PageContent>>>>;
};
export const defaultPreferences = (): Preferences => ({
  menu: [...DEFAULT_MENU],
  presentation: { color: '#0f172a', legend: true, corners: 0 },
  sectionAppearance: {},
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
    const savedColor = value.presentation?.color;
    const color = /^#[0-9a-f]{6}$/i.test(savedColor)
      ? savedColor.toLowerCase() === '#163d32' ? '#0f172a' : savedColor
      : '#0f172a';
    return {
      menu: menu.length ? menu : [...DEFAULT_MENU],
      presentation: {
        color,
        legend: value.presentation?.legend !== false,
        corners: [0, 4, 8, 12].includes(value.presentation?.corners)
          ? value.presentation.corners
          : 0,
      },
      sectionAppearance: Object.fromEntries(
        DEFAULT_MENU.map((page) => [
          page,
          Object.fromEntries(
            Object.entries(value.sectionAppearance?.[page] || {})
              .filter(([key, item]) => /^[a-z_]{1,40}$/.test(key) && item !== null && typeof item === 'object')
              .map(([key, item]) => {
                const appearance = item as Partial<SectionAppearance>;
                return [key, {
                  width: appearance.width === 'contained' ? 'contained' : 'stretch',
                  height: appearance.height === 'medium' || appearance.height === 'large' ? appearance.height : 'auto',
                  spacing: appearance.spacing === 'compact' || appearance.spacing === 'spacious' ? appearance.spacing : 'comfortable',
                  background: appearance.background === 'white' || appearance.background === 'mist' || appearance.background === 'sand' ? appearance.background : 'default',
                  corners: [0, 4, 8, 12].includes(appearance.corners as number) ? appearance.corners : 0,
                }];
              }),
          ),
        ]),
      ),
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
