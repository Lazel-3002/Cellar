/** What Customize adds to a system prompt: memory (via hybrid retrieval), skills, and connector instructions. */
import type { SkillDetail } from '@shared/types/customize';
import type { AppSettings } from '@shared/types/settings';
import { connectors } from '../connectors/manager';
import { retrieveMemory, formatMemoryBlock } from './memory-retrieval';
import { activeSkills, skillsPrompt } from './skills';

export interface AssistantContext {
  sections: string[];
  skills: SkillDetail[];
}

/** Options passed to assistantContext for memory retrieval. */
export interface AssistantContextOptions {
  settings: Pick<AppSettings, 'memoryEnabled' | 'generateMemoryFromChats' | 'chatReferenceEnabled'>;
  incognito: boolean;
  tools: boolean;
  /** The current user message (or last user turn) for relevance-based memory retrieval. */
  query?: string;
  /** Project ID of the current conversation, if any. */
  projectId?: string | null;
}

export async function assistantContext(options: AssistantContextOptions): Promise<AssistantContext> {
  const sections: string[] = [];
  if (options.settings.memoryEnabled && !options.incognito) {
    // Hybrid retrieval uses the current user message and project context to select only relevant memories.
    const result = await retrieveMemory({ query: options.query, projectId: options.projectId ?? null });
    const block = formatMemoryBlock(result);
    if (block) sections.push(block);
  }
  const skills = options.tools ? await activeSkills() : [];
  if (skills.length) sections.push(skillsPrompt(skills));
  if (options.tools) {
    for (const { name, text } of connectors.instructions()) sections.push(`<connector_instructions connector="${name.replace(/"/g, "'")}">\n${text.slice(0, 2000)}\n</connector_instructions>`);
  }
  return { sections, skills };
}
