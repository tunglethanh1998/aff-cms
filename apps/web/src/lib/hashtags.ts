const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const MENTION_RE = /@[\p{L}\p{N}._]+/gu;

export type TextEntities = {
  text: string;
  hashtags: string[];
  mentions: string[];
};

export function splitTextEntities(
  text: string | null | undefined,
): TextEntities {
  const raw = text?.trim() ?? "";
  if (!raw) {
    return { text: "", hashtags: [], mentions: [] };
  }

  const hashtags = uniqueTags(raw.match(HASHTAG_RE) ?? []);
  const mentions = uniqueTags(raw.match(MENTION_RE) ?? []);

  const cleaned = raw
    .replace(HASHTAG_RE, " ")
    .replace(MENTION_RE, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { text: cleaned, hashtags, mentions };
}

export function mergeTags(...groups: string[][]): string[] {
  return uniqueTags(groups.flat());
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }

  return result;
}
