import { join } from 'node:path';
import { app, BrowserWindow, safeStorage } from 'electron';
import { installPdfRenderer, installTaskNotifications } from './agent/desktop';
import { cleanupOrphanAttachments } from './chat/attachments';
import { chat } from './chat/orchestrator';
import { installPreview, registerPreviewScheme } from './code/preview';
import { stopAllSideChats } from './code/side-chat';
import { terminals } from './code/terminal';
import { closeDatabase, openDatabase } from './db/client';
import { downloads } from './hub/downloads';
import { handlers } from './ipc';
import { forwardBusToWindows, setTrustedOrigin } from './ipc/register';
import { initLogFile, logger } from './lib/log';
import { setSecretCodec } from './lib/secrets';
import { installAppMenu } from './menu';
import { localModels } from './models/local-index';
import { handleArtifactProtocol, registerArtifactScheme } from './protocol/artifact-protocol';
import { providers } from './providers/registry';
import { runtimes } from './runtimes/llamacpp-runtimes';
import { initPaths, paths } from './system/paths';
import { detectHardware } from './system/hardware';
import { createMainWindow, isAppUrl } from './window';

const log = logger('main');

registerArtifactScheme();
registerPreviewScheme();
app.setAppUserModelId('ai.cellar.desktop');
// Lets tests and portable setups keep chats and settings in a separate folder.
if (process.env.CELLAR_USER_DATA) app.setPath('userData', process.env.CELLAR_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    const runtimeDir = app.isPackaged ? join(process.resourcesPath, 'artifact-runtime') : join(app.getAppPath(), 'resources', 'artifact-runtime');
    initPaths(app.getPath('userData'), runtimeDir);
    initLogFile(paths().logs);
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
    installPreview();
    installAppMenu();
    installPdfRenderer();
    installTaskNotifications(() => mainWindow);

    mainWindow = createMainWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Warm caches in the background so the first screens render instantly.
    void detectHardware();
    void runtimes.list().then(() => providers.statusAll(true));
    void localModels.scan().catch((err) => log.error('model scan failed', err));
    void cleanupOrphanAttachments().catch(() => undefined);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  let disposing = false;
  app.on('before-quit', (event) => {
    if (disposing) return;
    disposing = true;
    event.preventDefault();
    chat.stopAll();
    stopAllSideChats();
    terminals.disposeAll();
    void providers
      .dispose()
      .catch((err) => log.error('dispose failed', err))
      .finally(() => {
        closeDatabase();
        app.exit(0);
      });
  });
}
