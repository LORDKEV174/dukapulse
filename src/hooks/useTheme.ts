import { useEffect } from 'react';
import type { ThemeMode } from '../types/duka';

export function useTheme(theme: ThemeMode = 'system') {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const shouldBeDark =
        theme === 'dark' || (theme === 'system' && media.matches);
      root.classList.toggle('dark', shouldBeDark);
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', shouldBeDark ? '#0f172a' : '#059669');
      }
    };

    apply();

    if (theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
  }, [theme]);
}
