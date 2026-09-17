import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeCookie {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
}

const cookieStore: FakeCookie[] = [];
const cookies = {
  get: vi.fn(async ({ domain }: { domain: string }) => cookieStore.filter((c) => c.domain === domain)),
  set: vi.fn(async (c: FakeCookie) => {
    cookieStore.push(c);
  }),
  remove: vi.fn(async (_url: string, name: string) => {
    const i = cookieStore.findIndex((c) => c.name === name);
    if (i >= 0) cookieStore.splice(i, 1);
  }),
};

vi.mock('electron', () => ({ session: { defaultSession: { cookies } } }));

const { loginStatus, clearDomainSession, saveDomainSession } = await import('../../src/main/browser/sessions');

describe('built-in browser session persistence', () => {
  beforeEach(() => {
    cookieStore.length = 0;
    cookies.get.mockClear();
    cookies.remove.mockClear();
  });

  it('reports not_logged_in when a domain has no cookies', async () => {
    expect(await loginStatus('example.com')).toBe('not_logged_in');
  });

  it('reports logged_in once the domain has any cookie', async () => {
    cookieStore.push({ name: 'theme', domain: 'example.com', path: '/', secure: true });
    expect(await loginStatus('example.com')).toBe('logged_in');
  });

  it('never touches cookies for localhost', async () => {
    await saveDomainSession('localhost');
    expect(cookies.get).not.toHaveBeenCalled();
  });

  it('removes every cookie it finds for a domain when clearing its session', async () => {
    cookieStore.push({ name: 'sid', domain: 'example.com', path: '/', secure: true });
    cookieStore.push({ name: 'pref', domain: 'example.com', path: '/', secure: false });
    await clearDomainSession('example.com');
    expect(cookies.remove).toHaveBeenCalledTimes(2);
    expect(cookieStore).toHaveLength(0);
  });
});
