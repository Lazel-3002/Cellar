import { parseParamsBillions } from '@shared/model-guidance';

export { parseParamsBillions };

export interface SystemPromptInput {
  modelName: string;
  userName: string;
  preferences: string;
  projectName?: string;
  projectInstructions?: string;
  projectKnowledge?: string;
  customSystemPrompt?: string;
  artifacts: boolean;
  now?: Date;
}

/**
 * Very small models tend to imitate the artifact instructions instead of answering,
 * so they only get them when they are at least ~3B parameters.
 */
export function supportsArtifactInstructions(model: { paramsLabel?: string; sizeBytes?: number }): boolean {
  const params = parseParamsBillions(model.paramsLabel);
  if (params !== undefined) return params >= 3;
  return model.sizeBytes === undefined || model.sizeBytes >= 2 * 1024 ** 3;
}

export const ARTIFACT_INSTRUCTIONS = `When you create substantial, self-contained content the user will likely want to view or reuse — a web page or small app, an SVG graphic, a React component, a Mermaid diagram, or a long document — put it in a fenced code block whose info string contains the word artifact and a short title, for example:

\`\`\`html artifact title="Pomodoro timer"
<!doctype html>
...
\`\`\`

Use html (a complete page; inline CSS and JS), svg, jsx (one React component with a default export; Tailwind classes are available), mermaid, or markdown (fence markdown artifacts with four backticks). Keep short snippets and explanations as normal Markdown. To update an artifact, output it again in full with the same title.`;

export function buildSystemPrompt(input: SystemPromptInput): string {
  const now = input.now ?? new Date();
  const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const parts: string[] = [
    `You are ${input.modelName}, a helpful AI assistant running privately on the user's own computer through Cellar. The current date is ${date}.`,
    'Write in Markdown. Use LaTeX between $…$ or $$…$$ for math. Be direct and genuinely helpful.',
  ];
  if (input.userName.trim()) parts.push(`The user's name is ${input.userName.trim()}.`);
  if (input.preferences.trim()) {
    parts.push(`<user_preferences>\n${input.preferences.trim()}\n</user_preferences>\nFollow these preferences when they are relevant.`);
  }
  if (input.projectInstructions?.trim() || input.projectKnowledge?.trim()) {
    parts.push(`This conversation belongs to the project "${input.projectName ?? 'Untitled'}".`);
    if (input.projectInstructions?.trim()) parts.push(`<project_instructions>\n${input.projectInstructions.trim()}\n</project_instructions>`);
    if (input.projectKnowledge?.trim()) parts.push(`<project_knowledge>\n${input.projectKnowledge.trim()}\n</project_knowledge>`);
  }
  if (input.artifacts) parts.push(ARTIFACT_INSTRUCTIONS);
  if (input.customSystemPrompt?.trim()) parts.push(input.customSystemPrompt.trim());
  return parts.join('\n\n');
}

export function cleanTitle(raw: string): string {
  const firstLine =
    raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim()
      .split('\n')
      .find((line) => line.trim()) ?? '';
  return firstLine
    .replace(/^title:\s*/i, '')
    .replace(/^[\s"'`*#]+|[\s"'`*.!?:]+$/g, '')
    .trim()
    .slice(0, 80);
}

export function fallbackTitle(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 7).join(' ');
  const title = words.length > 60 ? `${words.slice(0, 57)}…` : words;
  return title ? title.charAt(0).toUpperCase() + title.slice(1) : 'New chat';
}
