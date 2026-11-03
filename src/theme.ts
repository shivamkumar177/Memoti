import { useWindowDimensions } from 'react-native';

/** Tablet/desktop layout from here up: sidebar nav, centered content column. */
export function useIsWide(): boolean {
  return useWindowDimensions().width >= 768;
}

export const MAX_CONTENT_WIDTH = 1080;

/**
 * Single dark palette. The app is dark-only for now — poster art reads better
 * against it and it avoids threading a color scheme through every screen.
 */
export const colors = {
  bg: '#0E1116',
  surface: '#171B22',
  surfaceAlt: '#1F242D',
  border: '#2A313C',
  text: '#F2F5F9',
  textDim: '#98A2B3',
  textFaint: '#6B7688',
  accent: '#F5A524',
  accentDim: '#7A5410',
  positive: '#3FB68B',
  danger: '#E5484D',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const POSTER_RATIO = 2 / 3;

/** `142` → `2h 22m`. Returns `—` for null/zero so callers can render it directly. */
export function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** Long totals read better in days than in hundreds of hours. */
export function formatTotalRuntime(minutes: number): string {
  if (minutes <= 0) return '0m';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/** `2026-07-29` → `29 Jul 2026`, parsed as a plain date (no timezone shift). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

/** `2026-07` → `Jul 26`, for the stats chart axis. */
export function formatMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  if (!year || !m) return month;
  return `${months[m - 1]} ${String(year).slice(2)}`;
}
