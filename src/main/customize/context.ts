/** What Customize adds to a system prompt: memory, the skills list and connector instructions. */
import type { SkillDetail } from '@shared/types/customize';
import type { AppSettings } from '@shared/types/settings';
import { connectors } from '../connectors/manager';
import { listMemories, memoryPrompt } from './memory';
import { listMemoryTopics, memoryTopicsPrompt } from './memory-topics';
import { activeSkills, skillsPrompt } from './skills';

export interface AssistantContext {
  sections: string[];
  skills: SkillDetail[];
}

export async function assistantContext(options: { settings: Pick<AppSettings, 'memoryEnabled'>; incognito: boolean; tools: boolean }): Promise<AssistantContext> {
  const sections: string[] = [];
  if (options.settings.memoryEnabled && !options.incognito) {
    const memory = memoryPrompt(listMemories(), options.tools);
    if (memory) sections.push(memory);
    const topics = memoryTopicsPrompt(listMemoryTopics());
    if (topics) sections.push(topics);
  }
  const skills = options.tools ? await activeSkills() : [];
  if (skills.length) sections.push(skillsPrompt(skills));
  if (options.tools) {
    for (const { name, text } of connectors.instructions()) sections.push(`<connector_instructions connector="${name.replace(/"/g, "'")}">\n${text.slice(0, 2000)}\n</connector_instructions>`);
  }
  return { sections, skills };
}
