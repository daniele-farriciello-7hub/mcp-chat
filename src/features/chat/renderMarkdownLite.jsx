/**
 * A tiny markdown renderer for chat replies: **bold**, _italic_, `inline code`, [links](url),
 * headings, bullet and numbered lists, tables, blockquotes and fenced code blocks. Not a full
 * markdown engine — just what the assistant actually produces answering about credit policies
 * (figures in bold, an aside in italics, requirement lists, thresholds compared in a table, a
 * file's content quoted back with `>` or wrapped in a ``` fence) and, since it also renders the
 * admin panel's own prompt-field preview (`MarkdownTextarea.jsx`), real pasted markdown like a
 * README (headings, links, lists together).
 *
 * Italics only fire on `_..._`, and only where CommonMark itself would allow it — not directly
 * next to a letter or digit on either side — precisely so a snake_case name typed without backticks
 * (`max_tool_rounds`) never gets a chunk of it rendered in italics by accident.
 *
 * A link only renders as a real `<a>` for `http(s):`/`mailto:` targets; anything else (most often
 * `javascript:`) stays literal text instead of becoming a clickable link — this content can come
 * from a document or a model reply, neither fully trusted.
 *
 * Safe mid-stream: markers whose closing half has not arrived yet stay literal text until the pair
 * completes on a later chunk, and a table header renders as a plain line until its separator row
 * arrives.
 */

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|(?<![\w*])_[^_\n]+_(?![\w*]))/g;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;
const SAFE_LINK_SCHEME = /^(https?:|mailto:)/i;

function renderInline(text, keyPrefix) {
  return text
    .split(INLINE_PATTERN)
    .filter(Boolean)
    .map((part, i) => {
      const key = `${keyPrefix}-${i}`;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code key={key} className="rounded bg-surface px-1 py-0.5 text-[12px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      const link = LINK.exec(part);
      if (link) {
        const [, linkText, href] = link;
        if (SAFE_LINK_SCHEME.test(href.trim())) {
          return (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline underline-offset-2 hover:text-brand-700"
            >
              {linkText}
            </a>
          );
        }
        return part;
      }
      if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
}

const BULLET = /^[-*]\s+/;
const NUMBERED = /^\d+[.)]\s+/;
const QUOTE = /^>\s?/;
const FENCE = /^```(\S*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
// the row under the header: | --- | :---: | ---: |
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;

const splitRow = line =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(cell => cell.trim());

/**
 * Groups lines into blocks: fenced code, tables, bullet/numbered lists, blockquotes, headings,
 * blank lines and plain lines. A fence is checked first: its content must never be re-parsed as a
 * table, list, quote or heading just because a code sample happens to contain a `|`, `-` or `#` at
 * line start.
 */
function groupIntoBlocks(text) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let currentList = null;
  let currentQuote = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = FENCE.exec(line);
    if (fence) {
      const codeLines = [];
      i++;
      // no closing fence yet (still streaming) just means "everything else so far is code"
      while (i < lines.length && !FENCE.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      currentList = null;
      currentQuote = null;
      blocks.push({ type: 'code', lang: fence[1] || '', lines: codeLines });
      continue;
    }

    // a table needs its separator row to exist, otherwise it is just a line with pipes in it
    if (TABLE_ROW.test(line) && TABLE_SEPARATOR.test(lines[i + 1] || '')) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--;
      currentList = null;
      currentQuote = null;
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const trimmed = line.trim();

    if (QUOTE.test(trimmed)) {
      if (!currentQuote) {
        currentQuote = { type: 'quote', lines: [] };
        blocks.push(currentQuote);
      }
      currentQuote.lines.push(trimmed.replace(QUOTE, ''));
      currentList = null;
      continue;
    }
    currentQuote = null;

    const bullet = BULLET.test(trimmed);
    const numbered = NUMBERED.test(trimmed);
    if (bullet || numbered) {
      const ordered = numbered;
      if (!currentList || currentList.ordered !== ordered) {
        currentList = { ordered, items: [] };
        blocks.push({ type: 'list', ...currentList });
      }
      currentList.items.push(trimmed.replace(bullet ? BULLET : NUMBERED, ''));
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      currentList = null;
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }

    currentList = null;
    blocks.push({ type: 'line', text: line });
  }
  return blocks;
}

function Table({ header, rows, keyPrefix }) {
  // the panel is ~420px wide: a table with more than two columns has to scroll sideways
  return (
    <div className="my-1.5 overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-surface">
            {header.map((cell, i) => (
              <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-ink">
                {renderInline(cell, `${keyPrefix}-h-${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-line">
              {row.map((cell, c) => (
                <td key={c} className="px-2 py-1.5 align-top text-ink">
                  {renderInline(cell, `${keyPrefix}-${r}-${c}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Blockquote({ lines, keyPrefix, trailing }) {
  const lastIndex = lines.length - 1;
  return (
    <blockquote className="my-1.5 border-l-2 border-line pl-2.5 text-slate-soft">
      {lines.map((line, i) =>
        line.trim() === '' ? (
          <div key={i} className="h-1.5" />
        ) : (
          <div key={i}>
            {renderInline(line, `${keyPrefix}-${i}`)}
            {i === lastIndex ? trailing : null}
          </div>
        )
      )}
    </blockquote>
  );
}

// h1 down to h6, shrinking toward the body text size so a pasted README doesn't tower over a
// panel that is otherwise entirely 11-13px
const HEADING_CLASS = {
  1: 'text-[16px] font-bold',
  2: 'text-[14px] font-bold',
  3: 'text-[13px] font-bold',
  4: 'text-[12px] font-bold',
  5: 'text-[12px] font-bold',
  6: 'text-[12px] font-bold'
};

function Heading({ level, text, keyPrefix, trailing }) {
  return (
    <div className={`mb-1 mt-2 text-ink ${HEADING_CLASS[level]}`}>
      {renderInline(text, keyPrefix)}
      {trailing}
    </div>
  );
}

/** Fenced code is literal: no bold/italic/inline-code parsing inside it, same as any real markdown engine. */
function CodeBlock({ lines, trailing }) {
  return (
    <pre className="my-1.5 overflow-x-auto rounded-lg bg-surface px-2.5 py-2 text-[12px] leading-relaxed">
      <code>
        {lines.join('\n')}
        {trailing}
      </code>
    </pre>
  );
}

/** `trailing` (e.g. the streaming cursor) is appended inline right after the very last block. */
export function renderMarkdownLite(text, trailing = null) {
  const blocks = groupIntoBlocks(text);
  const lastIndex = blocks.length - 1;

  return blocks.map((block, i) => {
    const isLast = i === lastIndex;

    if (block.type === 'code') {
      return <CodeBlock key={`code-${i}`} lines={block.lines} trailing={isLast ? trailing : null} />;
    }

    if (block.type === 'table') {
      return (
        <div key={`table-${i}`}>
          <Table header={block.header} rows={block.rows} keyPrefix={`t-${i}`} />
          {isLast ? trailing : null}
        </div>
      );
    }

    if (block.type === 'heading') {
      return (
        <Heading
          key={`h-${i}`}
          level={block.level}
          text={block.text}
          keyPrefix={`h-${i}`}
          trailing={isLast ? trailing : null}
        />
      );
    }

    if (block.type === 'quote') {
      return (
        <Blockquote
          key={`quote-${i}`}
          lines={block.lines}
          keyPrefix={`q-${i}`}
          trailing={isLast ? trailing : null}
        />
      );
    }

    if (block.type === 'list') {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List key={`list-${i}`} className={`my-1 pl-4 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, j) => (
            <li key={j}>
              {renderInline(item, `li-${i}-${j}`)}
              {isLast && j === block.items.length - 1 ? trailing : null}
            </li>
          ))}
        </List>
      );
    }

    if (block.text.trim() === '') return <div key={`gap-${i}`} className="h-1.5" />;
    return (
      <div key={`line-${i}`}>
        {renderInline(block.text, `line-${i}`)}
        {isLast ? trailing : null}
      </div>
    );
  });
}
