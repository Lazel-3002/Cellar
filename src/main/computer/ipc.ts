/** IPC for computer use: the on-screen pill (stop, resume, its height) and the Settings page. */
import { z } from 'zod';
import { handle } from '../ipc/register';
import { computer } from './controller';

export function registerComputerHandlers(): void {
  handle('computer:state', () => computer.current());
  handle('computer:stop', () => computer.stop());
  handle('computer:resume', () => computer.resume());
  handle('computer:pillSize', (height) => computer.setPillHeight(z.number().finite().parse(height)));
  handle('computer:displays', () => computer.displays());
  handle('computer:test', () => computer.test());
}
