import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes?: number, digits = 1): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i >= 3 ? 2 : i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatCompact(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function formatContext(tokens?: number): string {
  if (!tokens) return '—';
  if (tokens >= 1024 && tokens % 1024 === 0) return `${tokens / 1024}K`;
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}K` : String(tokens);
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function relativeTime(timestamp?: number | string): string {
  if (!timestamp) return '';
  const t = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp;
  const diff = Date.now() - t;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: diff > 300 * day ? 'numeric' : undefined });
}

export function greetingFor(name: string, date = new Date()): string {
  const hour = date.getHours();
  const first = name.trim().split(/\s+/)[0];
  const who = first ? `, ${first}` : '';
  const lines = [
    hour < 5 ? `Up late${who}?` : hour < 12 ? `Good morning${who}` : hour < 18 ? `Good afternoon${who}` : `Good evening${who}`,
    `Back at it${who}`,
    "Let's get cooking",
    'What are we making today?',
    'Ready when you are',
  ];
  const seed = Math.floor(date.getTime() / (1000 * 60 * 30));
  return lines[seed % lines.length];
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** utf8-safe base64, for smuggling arbitrary text through an HTML attribute. */
export function toBase64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
