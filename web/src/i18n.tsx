import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import vi from './vi.json';

type Language = 'en' | 'vi';
let currentLanguage: Language = 'vi';
try { currentLanguage = localStorage.getItem('dofiin:language') === 'en' ? 'en' : 'vi'; } catch { /* Default to Vietnamese. */ }
const LanguageContext = createContext<{language: Language; setLanguage: (value: Language) => void}>({language: currentLanguage, setLanguage: () => {}});
export const getLocale = () => currentLanguage === 'vi' ? 'vi-VN' : 'en-US';

export function translateText(value: string): string {
  if (currentLanguage !== 'vi') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  const dictionary = vi as Record<string, string>;
  let translated = dictionary[trimmed];
  if (!translated) {
    const patterns: [RegExp, string][] = [
      [/^Your portfolio (beat|trailed) (.+) by ([\d.,]+) pp\. (.+) has the largest weight \((.+)\)\.$/, 'Danh mục $1 $2 $3 điểm phần trăm. $4 có tỷ trọng lớn nhất ($5).'],
      [/^Beta vs (.+)$/, 'Beta so với $1'], [/^Beta \/ (.+)$/, 'Beta / $1'],
      [/^Relative to (.+) in this period$/, 'So với $1 trong giai đoạn này'],
      [/^MA (\d+) \/ (\d+) crossover$/, 'Giao cắt MA $1 / $2'],
      [/^(\d+) months$/, '$1 tháng'], [/^(\d+) years$/, '$1 năm'],
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
    if (translated) translated = translated.replace('Danh mục beat ', 'Danh mục vượt ').replace('Danh mục trailed ', 'Danh mục thấp hơn ');
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
