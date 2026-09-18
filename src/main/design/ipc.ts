import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { BrowserWindow } from 'electron';
import { z } from 'zod';
import { THEMES } from '@shared/design/theme';
import type { Design } from '@shared/types/design';
import { chat } from '../chat/orchestrator';
import { handle } from '../ipc/register';
import { exportDesign } from './export';
import { addFontFile, addGoogleFont, fontFaceCss, listFonts, removeFont } from './fonts';
import { designForConversation, getVersionSnapshot, listDesigns, listVersions, renameVersion, restoreVersion, saveDesign } from './store';

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
    const input = z.object({ designId: z.string().min(1), format: z.enum(['png', 'pdf', 'pptx', 'svg', 'html']), artboardIds: z.array(z.string().max(60)).max(200).optional(), scale: z.number().min(0.25).max(4).optional() }).parse(request);
    return exportDesign(input, { window: BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] });
  });
  handle('design:versions:list', (designId) => listVersions(z.string().min(1).parse(designId)));
  handle('design:versions:get', (designId, versionId) => getVersionSnapshot(z.string().min(1).parse(designId), z.string().min(1).parse(versionId)));
  handle('design:versions:restore', (designId, versionId) => restoreVersion(z.string().min(1).parse(designId), z.string().min(1).parse(versionId)));
  handle('design:versions:rename', (designId, versionId, name) => renameVersion(z.string().min(1).parse(designId), z.string().min(1).parse(versionId), z.string().max(80).nullable().parse(name)));
  handle('fonts:list', () => listFonts());
  handle('fonts:addFiles', async (paths) => {
    const out = [];
    for (const path of z.array(z.string().min(1)).max(20).parse(paths)) out.push(addFontFile(basename(path), await readFile(path)));
    return out;
  });
  handle('fonts:addGoogle', (family) => addGoogleFont(z.string().min(1).max(60).parse(family)));
  handle('fonts:remove', (id) => removeFont(z.string().min(1).parse(id)));
  handle('fonts:css', (families) => fontFaceCss(z.array(z.string()).max(20).parse(families)));
}
