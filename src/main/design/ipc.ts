import { BrowserWindow } from 'electron';
import { z } from 'zod';
import { THEMES } from '@shared/design/theme';
import type { Design } from '@shared/types/design';
import { chat } from '../chat/orchestrator';
import { handle } from '../ipc/register';
import { exportDesign } from './export';
import { designForConversation, listDesigns, saveDesign } from './store';

const formatSchema = z.enum(['slides', 'document', 'social', 'poster', 'web', 'mobile', 'custom']);

export function registerDesignHandlers(): void {
  handle('design:list', () => listDesigns());
  handle('design:get', (conversationId) => {
    const design = designForConversation(z.string().min(1).parse(conversationId));
    if (!design) throw new Error('This design is gone. It may have been deleted.');
    return design;
  });
  handle('design:create', (options) => {
    const input = z.object({ format: formatSchema, themeId: z.string().max(60), title: z.string().max(120).optional() }).parse(options);
    return chat.createDesign({ ...input, themeId: THEMES.some((t) => t.id === input.themeId) ? input.themeId : THEMES[0].id });
  });
  handle('design:save', (design, baseVersion) => {
    if (!design || typeof design !== 'object' || typeof (design as Design).id !== 'string') throw new Error('The design could not be read.');
    if (JSON.stringify(design).length > 40_000_000) throw new Error('This design is too large to save.');
    return saveDesign(design as Design, z.number().int().parse(baseVersion));
  });
  handle('design:duplicate', (conversationId) => chat.duplicateDesign(z.string().min(1).parse(conversationId)));
  handle('design:export', (request) => {
    const input = z.object({ designId: z.string().min(1), format: z.enum(['png', 'pdf', 'pptx']), artboardIds: z.array(z.string().max(60)).max(200).optional(), scale: z.number().min(0.25).max(4).optional() }).parse(request);
    return exportDesign(input, { window: BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] });
  });
}
