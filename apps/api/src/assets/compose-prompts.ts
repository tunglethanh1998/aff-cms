import { readFileSync } from 'fs';
import { join } from 'path';

export type ComposePromptKind = 'with-background' | 'without-background';

const PROMPT_FILES: Record<ComposePromptKind, string> = {
  'with-background': 'compose-with-background.md',
  'without-background': 'compose-without-background.md',
};

export function loadComposePrompt(kind: ComposePromptKind): {
  filename: string;
  body: Buffer;
} {
  const filename = PROMPT_FILES[kind];
  const body = readFileSync(join(__dirname, 'prompts', filename));
  return { filename, body };
}

export function composePromptKindForDownload(hasBackground: boolean): ComposePromptKind {
  return hasBackground ? 'with-background' : 'without-background';
}
