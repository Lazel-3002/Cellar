import { describe, expect, it, vi } from 'vitest';

// The browser service itself needs a real window; only the URL gate is pure and worth testing here.
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, session: { defaultSession: {} }, shell: {}, WebContentsView: class {} }));

const { normalizeUrl } = await import('../../src/main/browser/browser');

describe('built-in browser URL gate', () => {
  it('adds https to a bare host', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
    expect(normalizeUrl('  example.com/docs?a=1  ')).toBe('https://example.com/docs?a=1');
  });

  it('keeps http and https as they are', () => {
    expect(normalizeUrl('http://localhost:3000/x')).toBe('http://localhost:3000/x');
    expect(normalizeUrl('https://example.com/a#b')).toBe('https://example.com/a#b');
  });

  it('refuses schemes that would hand the URL to the operating system', () => {
    for (const url of ['file:///C:/Windows/System32', 'javascript:alert(1)', 'ms-settings:privacy', 'mailto:someone@example.com']) {
      expect(() => normalizeUrl(url)).toThrow(/only opens http and https/);
    }
  });

  it('refuses empty and unparseable input', () => {
    expect(() => normalizeUrl('   ')).toThrow(/Give a URL/);
    expect(() => normalizeUrl('http://')).toThrow(/not a valid URL/);
  });

  it('allows the blank page a new tab starts on', () => {
    expect(normalizeUrl('about:blank')).toBe('about:blank');
  });
});
