export function inferNoteTitle(markdown: string, explicit?: string): string {
  const given = explicit?.trim();
  if (given) return clip(given);

  const heading = markdown.match(/^\s{0,3}#{1,6}\s+(.+)$/m);
  if (heading?.[1]) return clip(stripInline(heading[1]));

  const first = markdown.split('\n').find((line) => line.trim());
  if (first) return clip(stripInline(first.replace(/^\s{0,3}#{1,6}\s+/, '')));

  return 'Note';
}

function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text: string): string {
  return text.slice(0, 80);
}
