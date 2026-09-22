import { Linking, Text, View } from 'react-native';
import { useTheme } from '../ui/ThemeProvider';
import { serifFamily } from '../ui/Type';

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'paragraph'; text: string };

export function MarkdownView({ source }: { source: string }) {
  const t = useTheme();
  const blocks = parseBlocks(source);

  if (blocks.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const size = block.level === 1 ? 26 : block.level === 2 ? 20 : 17;
          return (
            <Text
              key={index}
              style={{
                fontFamily: serifFamily,
                fontSize: size,
                lineHeight: size + 6,
                color: t.ink,
              }}
            >
              <Inline text={block.text} />
            </Text>
          );
        }
        if (block.type === 'code') {
          return (
            <View
              key={index}
              style={{
                backgroundColor: t.bg,
                borderColor: t.line,
                borderWidth: 1,
                borderRadius: t.radiusChip,
                padding: 12,
              }}
            >
              <Text style={{ color: t.ink, fontFamily: 'monospace', fontSize: 13, lineHeight: 18 }}>
                {block.text}
              </Text>
            </View>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={index} style={{ gap: 4, paddingLeft: 4 }}>
              {block.items.map((item, itemIndex) => (
                <Text key={itemIndex} style={{ color: t.ink, fontSize: 15, lineHeight: 22 }}>
                  {block.ordered ? `${itemIndex + 1}. ` : '• '}
                  <Inline text={item} />
                </Text>
              ))}
            </View>
          );
        }
        if (block.type === 'quote') {
          return (
            <View
              key={index}
              style={{ borderLeftWidth: 2, borderLeftColor: t.ink, paddingLeft: 12 }}
            >
              <Text style={{ color: t.dim, fontSize: 15, lineHeight: 22, fontStyle: 'italic' }}>
                <Inline text={block.text} />
              </Text>
            </View>
          );
        }
        return (
          <Text key={index} style={{ color: t.ink, fontSize: 15, lineHeight: 22 }}>
            <Inline text={block.text} />
          </Text>
        );
      })}
    </View>
  );
}

function Inline({ text }: { text: string }) {
  const t = useTheme();
  const parts = splitInline(text);
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <Text key={index} style={{ fontFamily: 'monospace', color: t.ink, backgroundColor: t.bg }}>
              {part.text}
            </Text>
          );
        }
        if (part.type === 'link') {
          return (
            <Text
              key={index}
              style={{ color: t.ink, textDecorationLine: 'underline' }}
              onPress={() => void Linking.openURL(part.href)}
            >
              {part.text}
            </Text>
          );
        }
        return (
          <Text
            key={index}
            style={{
              color: t.ink,
              fontWeight: part.bold ? '600' : '400',
              fontStyle: part.italic ? 'italic' : 'normal',
            }}
          >
            {part.text}
          </Text>
        );
      })}
    </>
  );
}

type InlinePart =
  | { type: 'text'; text: string; bold?: boolean; italic?: boolean }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

function splitInline(input: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const regex =
    /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input))) {
    if (match.index > last) {
      parts.push({ type: 'text', text: input.slice(last, match.index) });
    }
    if (match[2]) parts.push({ type: 'code', text: match[2] });
    else if (match[4]) parts.push({ type: 'text', text: match[4], bold: true });
    else if (match[6]) parts.push({ type: 'text', text: match[6], italic: true });
    else if (match[8] && match[9]) parts.push({ type: 'link', text: match[8], href: match[9] });
    last = match.index + match[0].length;
  }
  if (last < input.length) parts.push({ type: 'text', text: input.slice(last) });
  return parts.length > 0 ? parts : [{ type: 'text', text: input }];
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', text: quoted.join(' ') });
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: para.join(' ') });
  }

  return blocks;
}
