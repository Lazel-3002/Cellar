import { join } from 'node:path';
import { app, BrowserWindow, safeStorage } from 'electron';
import { installPdfRenderer, installTaskNotifications } from './agent/desktop';
import { attachCloseToTray, backgroundActive, installBackground, isQuitting, markQuitting, showMainWindow } from './app/background';
import { browser, installBrowser } from './browser/browser';
import { cleanupOrphanAttachments } from './chat/attachments';
import { chat } from './chat/orchestrator';
import { configure as configureLsp, lsp } from './code/lsp';
import { installPreview, registerPreviewScheme } from './code/preview';
import { stopAllSideChats } from './code/side-chat';
import { terminals } from './code/terminal';
import { connectors } from './connectors/manager';
import { closeDatabase, openDatabase } from './db/client';
import { downloads } from './hub/downloads';
import { handlers } from './ipc';
import { forwardBusToWindows, setTrustedOrigin } from './ipc/register';
import { initLogFile, logger } from './lib/log';
import { setSecretCodec } from './lib/secrets';
import { installAppMenu } from './menu';
import { localModels } from './models/local-index';
import { handleArtifactProtocol, handleAttachmentProtocol, registerArtifactScheme } from './protocol/artifact-protocol';
import { handleVizProtocol } from './protocol/viz-protocol';
import { providers } from './providers/registry';
import { runtimes } from './runtimes/llamacpp-runtimes';
import { configure as configureOsScheduler } from './scheduled/os-scheduler';
import { scheduler } from './scheduled/scheduler';
import { settings } from './services/settings';
import { updater } from './services/updater';
import { initPaths, paths } from './system/paths';
import { detectHardware } from './system/hardware';
import { createMainWindow, isAppUrl } from './window';

const log = logger('main');

registerArtifactScheme();
registerPreviewScheme();
app.setAppUserModelId('ai.cellar.desktop');
// Lets tests and portable setups keep chats and settings in a separate folder.
if (process.env.CELLAR_USER_DATA) app.setPath('userData', process.env.CELLAR_USER_DATA);

/** Cellar was relaunched by its own OS-level wake job (schtasks/launchd/cron) for a due scheduled task, not opened by the user. */
const scheduledWake = process.argv.includes('--scheduled-wake');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  const openMainWindow = (): BrowserWindow => {
    mainWindow = createMainWindow();
    attachCloseToTray(mainWindow);
    mainWindow.on('closed', () => {
      mainWindow = null;
      // The (hidden) quick entry window would otherwise keep the app alive without a tray icon.
      if (!backgroundActive()) app.quit();
    });
    return mainWindow;
  };

  app.on('second-instance', (_event, argv) => {
    // Another instance was launched only to ping the OS wake job; this (already-running) instance
    // owns scheduling and just ticked or is about to, so don't steal focus for it.
    if (app.isReady() && !argv.includes('--scheduled-wake')) showMainWindow();
  });

  app.whenReady().then(() => {
    const runtimeDir = app.isPackaged ? join(process.resourcesPath, 'artifact-runtime') : join(app.getAppPath(), 'resources', 'artifact-runtime');
    initPaths(app.getPath('userData'), runtimeDir);
    initLogFile(paths().logs);
    configureOsScheduler({ isPackaged: app.isPackaged, appPath: app.getAppPath() });
    // Packages spawned as separate processes (language servers) live unpacked from the asar, like node-pty.
    configureLsp({ appRoot: app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath() });
    setSecretCodec({
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: (plain) => safeStorage.encryptString(plain),
      decrypt: (data) => safeStorage.decryptString(data),
    });
    openDatabase(paths().db);

    providers.init();
    chat.init();
    downloads.init();
    setTrustedOrigin(isAppUrl);
    handlers.register();
    forwardBusToWindows();
    handleArtifactProtocol();
    handleAttachmentProtocol();
    handleVizProtocol();
    installPreview();
    installAppMenu();
    installPdfRenderer();
    installTaskNotifications(() => mainWindow);

    // A scheduled-wake relaunch runs the due task quietly in the tray instead of popping a window
    // the user didn't ask for; anything else (a normal launch, or background mode being off) opens as usual.
    if (!scheduledWake || !settings.get().runInBackground) openMainWindow();
    installBackground({ getMainWindow: () => mainWindow, createMainWindow: openMainWindow });
    installBrowser(() => mainWindow);

    // Warm caches in the background so the first screens render instantly.
    void detectHardware();
    void runtimes.list().then(() => providers.statusAll(true));
    void localModels.scan().catch((err) => log.error('model scan failed', err));
    void cleanupOrphanAttachments().catch(() => undefined);
    connectors.init(app.getVersion());
    scheduler.init();
    updater.init();
  });

  app.on('window-all-closed', () => {
    // In background mode the window only hides; without a tray icon nothing could bring it back.
    if (isQuitting() || !backgroundActive()) app.quit();
  });

  let disposing = false;
  app.on('before-quit', (event) => {
    markQuitting();
    if (disposing) return;
    disposing = true;
    event.preventDefault();
    chat.stopAll();
    stopAllSideChats();
    terminals.disposeAll();
    browser.dispose();
    scheduler.dispose();
    updater.dispose();
    void Promise.all([providers.dispose(), connectors.dispose(), lsp.disposeAll()])
      .catch((err) => log.error('dispose failed', err))
      .finally(() => {
        closeDatabase();
        app.exit(0);
      });
  });
}
