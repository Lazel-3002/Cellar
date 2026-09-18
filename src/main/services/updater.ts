import { app } from 'electron';
import type { AppUpdateState } from '@shared/types/update';
import { bus } from '../lib/events';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';
import { settings } from './settings';

const log = logger('updater');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
// Give the app a chance to finish rendering the first window before touching the network.
const FIRST_CHECK_DELAY_MS = 15_000;

type AutoUpdater = import('electron-updater').AppUpdater;

let state: AppUpdateState = { stage: 'idle' };
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
let checking: Promise<AppUpdateState> | null = null;
let autoUpdaterPromise: Promise<AutoUpdater | null> | null = null;

/**
 * electron-updater reads app-update.yml, which electron-builder only writes into packaged
 * builds (from this file's `publish` block). Loading it lazily and only when packaged keeps
 * `npm run dev` and unit tests from touching that file or Electron's net stack at all.
 */
function loadAutoUpdater(): Promise<AutoUpdater | null> {
  if (!app.isPackaged) return Promise.resolve(null);
  if (!autoUpdaterPromise) {
    // electron-updater exports `autoUpdater` via a lazy getter that Node's CJS/ESM interop
    // does not pick up as a named export (it resolves to undefined); the default export is
    // the real module.exports object, so read it from there instead.
    autoUpdaterPromise = import('electron-updater').then((mod) => {
      const autoUpdater = (mod.default ?? mod).autoUpdater;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.logger = log;
      autoUpdater.on('checking-for-update', () => setState({ stage: 'checking', error: undefined }));
      autoUpdater.on('update-available', (info) =>
        setState({ stage: 'downloading', version: info.version, releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined, releaseDate: info.releaseDate }),
      );
      autoUpdater.on('update-not-available', () => setState({ stage: 'not-available', checkedAt: Date.now() }));
      autoUpdater.on('download-progress', (progress) =>
        setState({ stage: 'downloading', percent: progress.percent, bytesPerSecond: progress.bytesPerSecond, transferred: progress.transferred, total: progress.total }),
      );
      autoUpdater.on('update-downloaded', (info) => setState({ stage: 'downloaded', version: info.version, checkedAt: Date.now() }));
      autoUpdater.on('error', (err) => {
        log.error('update check failed', err);
        setState({ stage: 'error', error: errorMessage(err), checkedAt: Date.now() });
      });
      return autoUpdater;
    });
  }
  return autoUpdaterPromise;
}

function setState(patch: Partial<AppUpdateState>): AppUpdateState {
  state = { ...state, ...patch };
  bus.emit('update:changed', state);
  return state;
}

async function runCheck(): Promise<AppUpdateState> {
  const current = await loadAutoUpdater();
  if (!current) return setState({ stage: 'not-available', checkedAt: Date.now() });
  // checkForUpdates() resolves once metadata is fetched; the actual download (if any) continues
  // in the background and is reported through the 'download-progress' / 'update-downloaded' events above.
  try {
    await current.checkForUpdates();
  } catch (err) {
    log.error('checkForUpdates failed', err);
    setState({ stage: 'error', error: errorMessage(err), checkedAt: Date.now() });
  }
  return state;
}

/** Coalesces concurrent callers (auto timer + a manual "Check for updates" click) into one request. */
function check(): Promise<AppUpdateState> {
  if (checking) return checking;
  checking = runCheck().finally(() => {
    checking = null;
  });
  return checking;
}

function autoCheckTick(): void {
  if (!settings.get().autoUpdateCheck) return;
  void check();
}

export const updater = {
  /** Starts the background check/download cycle. Never blocks the caller. */
  init(): void {
    // Deferred and fire-and-forget so app startup never waits on a network round trip.
    timeoutHandle = setTimeout(autoCheckTick, FIRST_CHECK_DELAY_MS);
    intervalHandle = setInterval(autoCheckTick, CHECK_INTERVAL_MS);
  },

  dispose(): void {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (intervalHandle) clearInterval(intervalHandle);
    timeoutHandle = null;
    intervalHandle = null;
  },

  state(): AppUpdateState {
    return state;
  },

  /** Manual "Check for updates" button: runs regardless of the auto-check setting. */
  checkNow(): Promise<AppUpdateState> {
    return check();
  },

  async install(): Promise<void> {
    if (state.stage !== 'downloaded') return;
    const current = await loadAutoUpdater();
    current?.quitAndInstall();
  },
};

// TODO(release): once a code-signing certificate is purchased, sign the NSIS installer in CI
// and switch electron-builder.yml's `forceCodeSigning` to true so unsigned builds fail loudly.
