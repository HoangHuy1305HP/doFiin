import type { Page } from './types';
import type { CSSProperties } from 'react';
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
  background: 'default' | 'white' | 'mist' | 'sand' | `#${string}`;
  corners: 0 | 4 | 8 | 12;
  chartColor?: string;
  chartStyle?: 'area' | 'line';
  showLegend?: boolean;
};
export type PageAppearance = {
  horizontalPadding: number | null;
  topPadding: number | null;
  bottomPadding: number | null;
  maxWidth: number | null;
};
export const DEFAULT_PAGE_APPEARANCE: PageAppearance = {
  horizontalPadding: null,
  topPadding: null,
  bottomPadding: null,
  maxWidth: null,
};
export function pageAppearanceStyle(appearance?: PageAppearance): CSSProperties {
  return {
    paddingLeft: appearance?.horizontalPadding == null ? undefined : `${appearance.horizontalPadding}px`,
    paddingRight: appearance?.horizontalPadding == null ? undefined : `${appearance.horizontalPadding}px`,
    paddingTop: appearance?.topPadding == null ? undefined : `${appearance.topPadding}px`,
    paddingBottom: appearance?.bottomPadding == null ? undefined : `${appearance.bottomPadding}px`,
    maxWidth: appearance?.maxWidth == null ? undefined : `${appearance.maxWidth}px`,
  };
}
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
  pageAppearance: Partial<Record<Page, PageAppearance>>;
  locale: ContentLocale;
  content: Partial<Record<Page, Partial<Record<ContentLocale, PageContent>>>>;
};
export const defaultPreferences = (): Preferences => ({
  menu: [...DEFAULT_MENU],
  presentation: { color: '#0f172a', legend: true, corners: 0 },
  sectionAppearance: {},
  pageAppearance: {},
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
                  background: appearance.background === 'white' || appearance.background === 'mist' || appearance.background === 'sand' || /^#[0-9a-f]{6}$/i.test(appearance.background || '') ? appearance.background : 'default',
                  corners: [0, 4, 8, 12].includes(appearance.corners as number) ? appearance.corners : 0,
                  chartColor: /^#[0-9a-f]{6}$/i.test(appearance.chartColor || '') ? appearance.chartColor : undefined,
                  chartStyle: appearance.chartStyle === 'area' || appearance.chartStyle === 'line' ? appearance.chartStyle : undefined,
                  showLegend: typeof appearance.showLegend === 'boolean' ? appearance.showLegend : undefined,
                }];
              }),
          ),
        ]),
      ),
      pageAppearance: Object.fromEntries(
        DEFAULT_MENU.map((page) => {
          const appearance = value.pageAppearance?.[page];
          const valid = (input: unknown, allowed: number[]) => allowed.includes(input as number) ? input as number : null;
          return [page, {
            horizontalPadding: valid(appearance?.horizontalPadding, [16, 24, 32, 40, 48, 60, 80]),
            topPadding: valid(appearance?.topPadding, [24, 40, 48, 64, 80, 96]),
            bottomPadding: valid(appearance?.bottomPadding, [24, 40, 48, 64, 80, 96]),
            maxWidth: valid(appearance?.maxWidth, [1200, 1400, 1600]),
          }];
        }),
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
