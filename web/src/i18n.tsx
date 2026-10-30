import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import vi from './vi.json';
import viExtra from './vi-extra.json';
import viStudio from './vi-studio.json';
import en from './en.json';
import enBackend from './en-backend.json';

type Language = 'en' | 'vi';
let currentLanguage: Language = 'vi';
try { currentLanguage = localStorage.getItem('dofiin:language') === 'en' ? 'en' : 'vi'; } catch { /* Default to Vietnamese. */ }
const LanguageContext = createContext<{language: Language; setLanguage: (value: Language) => void}>({language: currentLanguage, setLanguage: () => {}});
export const getLocale = (): 'vi-VN' | 'en-US' => currentLanguage === 'vi' ? 'vi-VN' : 'en-US';
const vietnamese: Record<string, string> = { ...vi, ...viExtra, ...viStudio };
const english: Record<string, string> = { ...en, ...enBackend };

export function translateText(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  const dictionary = currentLanguage === 'vi' ? vietnamese : english;
  let translated = dictionary[trimmed];
  if (!translated && currentLanguage === 'vi') {
    const patterns: [RegExp, string][] = [
      [/^Your portfolio (beat|trailed) (.+) by ([\d.,]+) pp\. (.+) has the largest weight \((.+)\)\.$/, 'Danh mục $1 $2 $3 điểm phần trăm. $4 có tỷ trọng lớn nhất ($5).'],
      [/^Beta vs (.+)$/, 'Beta so với $1'], [/^Beta \/ (.+)$/, 'Beta / $1'],
      [/^Relative to (.+) in this period$/, 'So với $1 trong giai đoạn này'],
      [/^MA (\d+) \/ (\d+) crossover$/, 'Giao cắt MA $1 / $2'],
      [/^(\d+) months$/, '$1 tháng'], [/^(\d+) years$/, '$1 năm'],
      [/^1 month$/, '1 tháng'], [/^1 year$/, '1 năm'],
      [/^(\d+) simulated trade$/, '$1 giao dịch mô phỏng'],
      [/^(\d+) portfolios?$/, '$1 danh mục'],
      [/^(\d+) years? of historical data$/, '$1 năm dữ liệu lịch sử'],
      [/^Studio: save (\d+) layouts$/, 'Studio: lưu $1 bố cục'],
      [/^Equivalent to(.+)\/month$/, 'Tương đương $1/tháng'],
      [/^Portfolio saved · Version\s*(\d+)$/, 'Đã lưu danh mục · Phiên bản $1'],
      [/^Version\s*(\d+)$/, 'Phiên bản $1'], [/^Asset (\d+)$/, 'Tài sản $1'],
      [/^Purchased (.+) ·$/, 'Ngày mua $1 ·'],
      [/^(.+) before costs$/, '$1 trước phí'], [/^(.+) simulated trades$/, '$1 giao dịch mô phỏng'],
      [/^Candidate cap: (.+) per asset · Cash preserved: (.+)\.$/, 'Giới hạn: $1 mỗi mã · Giữ nguyên tiền mặt: $2.'],
      [/^Chart window: (.+)$/, 'Cửa sổ biểu đồ: $1'],
      [/^Window (.+)$/, 'Cửa sổ $1'],
    ];
    for (const [pattern, replacement] of patterns) {
      if (pattern.test(trimmed)) { translated = trimmed.replace(pattern, replacement); break; }
    }
    if (!translated) {
      const drag = trimmed.match(/^Drag (.+)$/);
      const edit = trimmed.match(/^Edit (.+) menu item$/);
      const move = trimmed.match(/^Move (.+) (up|down)$/);
      const remove = trimmed.match(/^Remove (.+) section$/);
      const sections = trimmed.match(/^(.+) sections$/);
      if (drag) translated = `Kéo ${translateText(drag[1])}`;
      else if (edit) translated = `Sửa mục menu ${translateText(edit[1])}`;
      else if (move) translated = `Chuyển ${translateText(move[1])} ${move[2] === 'up' ? 'lên' : 'xuống'}`;
      else if (remove) translated = `Xóa khối ${translateText(remove[1])}`;
      else if (sections) translated = `Các khối ${translateText(sections[1])}`;
    }
    if (translated) translated = translated.replace('Danh mục beat ', 'Danh mục vượt ').replace('Danh mục trailed ', 'Danh mục thấp hơn ');
  }
  if (!translated && currentLanguage === 'en') {
    const fallback = trimmed.match(/^(\d+) lần thiếu dữ liệu\/tối ưu không hội tụ: dùng tỷ trọng đều, không dùng tỷ trọng tối ưu cả kỳ\.$/);
    if (fallback) translated = `${fallback[1]} data gaps or failed optimizations: equal weights were used instead of hindsight-optimized weights.`;
    const alpacaAccess = trimmed.match(/^Alpaca từ chối API key hoặc quyền truy cập IEX \(HTTP (\d+)\)\.$/);
    if (alpacaAccess) translated = `Alpaca rejected the API key or IEX access (HTTP ${alpacaAccess[1]}).`;
    const alpacaData = trimmed.match(/^Alpaca chưa trả dữ liệu giá \(([^)]+)\)\.$/);
    if (alpacaData) translated = `Alpaca returned no price data (${alpacaData[1]}).`;
    const yahooData = trimmed.match(/^Yahoo Finance chưa có dữ liệu hợp lệ cho (.+)\.$/);
    if (yahooData) translated = `Yahoo Finance has no valid data for ${yahooData[1]}.`;
    const studioAction = trimmed.match(/^(Drag|Edit|Move|Remove) (.+?)( menu item| section| up| down)?$/);
    if (!translated && studioAction) translated = `${studioAction[1]} ${translateText(studioAction[2])}${studioAction[3] || ''}`;
  }
  if (!translated) return value;
  return (value.startsWith(' ') ? ' ' : '') + translated + (value.endsWith(' ') ? ' ' : '');
}

// Called only at JSX display boundaries, never on requests, identifiers or saved form values.
export function translateNode<T>(value: T): T {
  if (typeof value === 'string') return translateText(value) as T;
  if (Array.isArray(value)) return value.map((item) => translateNode(item)) as T;
  return value;
}
export const useLanguage = () => useContext(LanguageContext);

export function LanguageProvider({children}: {children: ReactNode}) {
  const [language, update] = useState<Language>(currentLanguage);
  currentLanguage = language;
  const setLanguage = (value: Language) => {
    currentLanguage = value;
    update(value);
    try { localStorage.setItem('dofiin:language', value); } catch { /* Session still works. */ }
  };
  useEffect(() => { document.documentElement.lang = language; document.title = language === 'vi' ? 'doFiin — Phân tích danh mục' : 'doFiin — Portfolio Analytics'; }, [language]);
  return <LanguageContext.Provider value={{language, setLanguage}}>{children}</LanguageContext.Provider>;
}
