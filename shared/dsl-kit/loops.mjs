/**
 * AnyWorkflow DSL loop kit: the single implementation of `@for` headers and loop sources.
 *
 * Authored here and vendored verbatim into Anyworkflow-remote (`shared/dsl-kit`), Anyworkflow-mcp
 * and the AnyWorkflow browser extension. Each consumer keeps its own block walker, but what a
 * `@for` header says and which values each iteration binds is decided only here, so the editor,
 * the cloud compiler and the executor cannot disagree about a loop.
 *
 *   @for i in range(1, 10) {                   numbers; the stop is inclusive, step optional
 *   @for topic in [函数, 极限, "带,逗号的项"] {  a list; `,`, `，` or a line break separates items
 *   @for ch, title in [(1, 绪论), (2, 函数)] {  tuples bind several names at once
 *   @for sec in %secs% {                       a list held by an enclosing loop or @let
 *   @for s in range(1, %n%) {                  bounds taken from enclosing variables
 *
 * A list may span several lines; the header ends at the `{` after its closing `]`. Lists never
 * contain `{` or `}`, so every brace-matching scanner stays correct without knowing about lists.
 *
 * Every iteration also binds `index` and `count`. In a list loop `index` is the 1-based position;
 * in a range loop it repeats the value (the long-standing behaviour plans rely on).
 */

export const LOOP_ALIASES = Object.freeze(['index', 'count']);
export const MAX_LOOP_NAMES = 8;

const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const TEMPLATE_TOKEN = /%([A-Za-z_][A-Za-z0-9_]*)(?::([A-Za-z0-9_]+))?%/gu;
const UNRESOLVED_TOKEN = /%([A-Za-z_][A-Za-z0-9_]*)(?::[A-Za-z0-9_]+)?%/u;
const BACKTICK_FENCE = '```';
const TILDE_FENCE = '~~~';
const ZH_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

const isInlineSpace = (char) => char === ' ' || char === '\t';
const isSeparator = (char) => char === ',' || char === '，';

function lineEndAt(text, at) {
  const end = text.indexOf('\n', at);
  return end < 0 ? text.length : end;
}

function skipInline(text, at) {
  let cursor = at;
  while (cursor < text.length && isInlineSpace(text[cursor])) cursor += 1;
  return cursor;
}

function failure(error, at) {
  return { ok: false, error, at };
}

/** True for a trimmed line that starts a `@for` header (it may still be malformed). */
export function isLoopHeaderLine(trimmed) {
  return /^@for(?:[ \t]|$)/iu.test(trimmed);
}

// ---------------------------------------------------------------------------------------------
// Template values
// ---------------------------------------------------------------------------------------------

function chineseUnder100(value) {
  if (!Number.isInteger(value) || value < 0 || value > 99) return String(value);
  if (value < 10) return ZH_DIGITS[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens === 1 ? '' : ZH_DIGITS[tens]}十${ones ? ZH_DIGITS[ones] : ''}`;
}

/**
 * Formats a value for `%name:format%`: `pad2`/`padN`/`N` zero-pad to N digits (1–12), `zh` writes
 * 0–99 as Chinese numerals. Returns null for a format nobody understands, so the token is kept.
 */
export function formatTemplateValue(value, format) {
  const raw = String(value);
  if (!format) return raw;
  const numeric = raw.trim() !== '' && Number.isFinite(Number(raw)) ? Math.trunc(Number(raw)) : null;
  if (format === 'zh') return numeric === null ? raw : chineseUnder100(numeric);
  const width = Number(format === 'pad2' ? 2 : (format.match(/^pad(\d+)$/u)?.[1] ?? (/^\d+$/u.test(format) ? format : NaN)));
  if (!Number.isSafeInteger(width) || width < 1 || width > 12) return null;
  return (numeric === null ? raw : String(numeric)).padStart(width, '0');
}

/** Replaces `%name%` / `%name:format%` for names in `vars`; anything else is left as written. */
export function substituteTemplate(text, vars) {
  return String(text).replace(TEMPLATE_TOKEN, (whole, name, format) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return whole;
    return formatTemplateValue(vars[name] ?? '', format) ?? whole;
  });
}

// ---------------------------------------------------------------------------------------------
// List literals
// ---------------------------------------------------------------------------------------------

function parseQuoted(text, at) {
  const quote = text[at];
  let value = '';
  let cursor = at + 1;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === '\n') break;
    if (char === '{' || char === '}') return failure('循环列表里不能包含 { 或 }', cursor);
    if (char === '\\' && cursor + 1 < text.length && text[cursor + 1] !== '\n') {
      value += text[cursor + 1];
      cursor += 2;
      continue;
    }
    if (char === quote) return { ok: true, value, end: cursor + 1 };
    value += char;
    cursor += 1;
  }
  return failure('列表里的引号没有闭合', at);
}

function parseBare(text, at) {
  let depth = 0;
  let cursor = at;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === '\n' || (depth === 0 && (isSeparator(char) || char === ']' || char === ')'))) break;
    if (char === '{' || char === '}') return failure('循环列表里不能包含 { 或 }', cursor);
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    cursor += 1;
  }
  if (depth !== 0) return failure('列表项里的括号不配对，可以给这一项加上引号', at);
  return { ok: true, value: text.slice(at, cursor).trim(), end: cursor };
}

function parseItem(text, at) {
  const char = text[at];
  if (char === '[' || char === '(') {
    const parsed = parseSequence(text, at);
    if (!parsed.ok) return parsed;
    return { ok: true, value: char === '[' ? { list: parsed.items } : { tuple: parsed.items }, end: parsed.end };
  }
  if (char === '"' || char === "'") return parseQuoted(text, at);
  return parseBare(text, at);
}

/** `[ ... ]` or `( ... )` starting at `at`; items are separated by `,`, `，` or line breaks. */
function parseSequence(text, at) {
  const close = text[at] === '[' ? ']' : ')';
  const items = [];
  let cursor = at + 1;
  let expectItem = true;
  let lineBreak = false;

  while (cursor < text.length) {
    const char = text[cursor];
    if (isInlineSpace(char) || char === '\r') {
      cursor += 1;
      continue;
    }
    if (char === '\n') {
      lineBreak = true;
      cursor += 1;
      continue;
    }
    if (char === close) return { ok: true, items, end: cursor + 1 };
    if (char === ']' || char === ')') return failure('循环列表的括号不配对', cursor);
    if (char === '{' || char === '}') return failure('循环列表里不能包含 { 或 }', cursor);
    if (isSeparator(char)) {
      if (expectItem) return failure('循环列表里有空项', cursor);
      expectItem = true;
      lineBreak = false;
      cursor += 1;
      continue;
    }
    if (!expectItem && !lineBreak) return failure('列表项之间要用逗号分隔', cursor);
    const item = parseItem(text, cursor);
    if (!item.ok) return item;
    if (typeof item.value === 'string' && item.value === '' && text[cursor] !== '"' && text[cursor] !== "'") {
      return failure('循环列表里有空项', cursor);
    }
    items.push(item.value);
    cursor = item.end;
    expectItem = false;
    lineBreak = false;
  }
  return failure(`循环列表缺少 ${close}`, at);
}

function needsQuotes(value) {
  return value === '' || /^[\s"'[(]|\s$|[,，\n"\\[\]()]/u.test(value);
}

/** Canonical text of a loop value; nested lists and tuples read back to the same value. */
export function formatLoopValue(value) {
  if (typeof value === 'string') {
    return needsQuotes(value) ? `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"` : value;
  }
  if (Array.isArray(value?.list)) return `[${value.list.map(formatLoopValue).join(', ')}]`;
  if (Array.isArray(value?.tuple)) return `(${value.tuple.map(formatLoopValue).join(', ')})`;
  return String(value ?? '');
}

/** Parses a whole `[ ... ]` literal, e.g. the text a list variable holds. */
export function parseLoopList(text) {
  const source = String(text).trim();
  if (!source.startsWith('[')) return failure('不是列表', 0);
  const parsed = parseSequence(source, 0);
  if (!parsed.ok) return parsed;
  if (source.slice(parsed.end).trim()) return failure('列表的 ] 后面不能再有内容', parsed.end);
  return { ok: true, items: parsed.items };
}

// ---------------------------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------------------------

/**
 * Reads the `@for` header that starts at `at` (the `@`). Returns null when the text there is not a
 * `@for` header at all, `{ ok: false, error, end }` for a malformed one (`end` is where scanning
 * may resume), or `{ ok: true, names, source, from, openAt }` where `openAt` is the body's `{`.
 */
export function readLoopHeader(text, at) {
  if (!/^@for[ \t]/iu.test(text.slice(at, at + 5))) return null;
  const firstLineEnd = lineEndAt(text, at);
  const fail = (error, end = firstLineEnd) => ({ ok: false, error, end });

  let cursor = skipInline(text, at + 4);
  const names = [];
  for (;;) {
    NAME.lastIndex = cursor;
    const match = NAME.exec(text);
    if (!match) return fail('@for 后面要写变量名，例如 @for i in range(1, 3) {');
    names.push(match[0]);
    cursor = skipInline(text, NAME.lastIndex);
    if (text[cursor] !== ',') break;
    cursor = skipInline(text, cursor + 1);
  }
  if (!/^in(?![A-Za-z0-9_])/iu.test(text.slice(cursor, cursor + 3))) {
    return fail('循环要写成 @for 变量 in 来源 {，例如 @for i in range(1, 3) {');
  }
  for (const [position, name] of names.entries()) {
    if (LOOP_ALIASES.includes(name)) return fail(`${name} 是循环自带的变量，请换一个变量名`);
    if (names.indexOf(name) !== position) return fail(`循环变量 ${name} 重复了`);
  }
  if (names.length > MAX_LOOP_NAMES) return fail(`一个循环最多 ${MAX_LOOP_NAMES} 个变量`);

  const sourceFrom = skipInline(text, cursor + 2);
  let sourceEnd;
  if (/^range[ \t]*\(/iu.test(text.slice(sourceFrom, sourceFrom + 12))) {
    const close = text.indexOf(')', sourceFrom);
    if (close < 0 || close > firstLineEnd) return fail('range(...) 缺少右括号');
    sourceEnd = close + 1;
  } else if (text[sourceFrom] === '[') {
    const parsed = parseSequence(text, sourceFrom);
    if (!parsed.ok) return fail(parsed.error, lineEndAt(text, parsed.at));
    sourceEnd = parsed.end;
  } else if (text[sourceFrom] === '%') {
    const match = text.slice(sourceFrom).match(/^%[A-Za-z_][A-Za-z0-9_]*%/u);
    if (!match) return fail('循环来源写成 %变量名%');
    sourceEnd = sourceFrom + match[0].length;
  } else {
    return fail('循环来源只能是 range(...)、[列表] 或 %变量%');
  }

  const openAt = skipInline(text, sourceEnd);
  const headerEnd = lineEndAt(text, sourceEnd);
  if (text[openAt] !== '{') return fail('循环头要以 { 结尾', headerEnd);
  if (text.slice(openAt + 1, lineEndAt(text, openAt)).trim()) return fail('循环的 { 后面要换行再写内容', headerEnd);
  return { ok: true, names, source: text.slice(sourceFrom, sourceEnd), from: at, openAt };
}

// ---------------------------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------------------------

function parseRange(args, maxItems) {
  const parts = args.split(',').map((part) => part.trim());
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => part === '')) {
    return failure('range 必须写成 range(结束)、range(开始, 结束) 或 range(开始, 结束, 步长)', 0);
  }
  const numbers = parts.map(Number);
  if (numbers.some((value) => !Number.isSafeInteger(value))) {
    return failure(`range 的参数必须是整数，现在是 range(${parts.join(', ')})`, 0);
  }
  const start = numbers.length === 1 ? 0 : numbers[0];
  const stop = numbers.length === 1 ? numbers[0] : numbers[1];
  const step = numbers.length === 3 ? numbers[2] : 1;
  if (step === 0) return failure('range 的步长不能为 0', 0);
  if ((step > 0 && start > stop) || (step < 0 && start < stop)) return { ok: true, values: [] };
  const count = Math.floor(Math.abs(stop - start) / Math.abs(step)) + 1;
  if (!Number.isSafeInteger(count) || count > maxItems) return failure(`一个循环最多 ${maxItems} 项`, 0);
  return { ok: true, values: Array.from({ length: count }, (_, index) => start + index * step) };
}

function bindItem(names, item, position, count) {
  const binding = {};
  const label = `第 ${position + 1} 项`;
  if (item && typeof item === 'object' && Array.isArray(item.tuple)) {
    if (item.tuple.length !== names.length) {
      return failure(`${label}有 ${item.tuple.length} 个值，但循环写了 ${names.length} 个变量（${names.join(', ')}）`, 0);
    }
    names.forEach((name, slot) => {
      const part = item.tuple[slot];
      binding[name] = typeof part === 'string' ? part : formatLoopValue(part);
    });
  } else if (names.length === 1) {
    binding[names[0]] = typeof item === 'string' ? item : formatLoopValue(item);
  } else {
    return failure(`${label}要写成 (${names.join(', ')}) 这样的 ${names.length} 个值`, 0);
  }
  binding.index = position + 1;
  binding.count = count;
  return { ok: true, binding };
}

/**
 * The values each iteration binds, after substituting `vars` into the source. Every binding holds
 * the loop's own names plus `index` and `count`; list values that are themselves lists or tuples
 * are bound as their canonical text, ready for an inner `@for x in %name%`.
 */
export function expandLoop(header, vars = {}, { maxItems = 1000 } = {}) {
  const source = substituteTemplate(header.source, vars).trim();
  const unresolved = source.match(UNRESOLVED_TOKEN);
  if (unresolved) return { ok: false, error: `循环使用了未定义的变量 %${unresolved[1]}%` };

  if (/^range\s*\(/iu.test(source)) {
    if (header.names.length !== 1) return { ok: false, error: 'range 循环只能有一个变量名' };
    const args = source.match(/^range\s*\(([^()]*)\)$/iu);
    if (!args) return { ok: false, error: `range 写法无效：${source}` };
    const range = parseRange(args[1], maxItems);
    if (!range.ok) return { ok: false, error: range.error };
    const [name] = header.names;
    return {
      ok: true,
      kind: 'range',
      iterations: range.values.map((value) => ({ [name]: value, index: value, count: range.values.length })),
    };
  }

  if (source.startsWith('[')) {
    const list = parseLoopList(source);
    if (!list.ok) return { ok: false, error: list.error };
    if (list.items.length > maxItems) return { ok: false, error: `一个循环最多 ${maxItems} 项` };
    const iterations = [];
    for (const [position, item] of list.items.entries()) {
      const bound = bindItem(header.names, item, position, list.items.length);
      if (!bound.ok) return { ok: false, error: bound.error };
      iterations.push(bound.binding);
    }
    return { ok: true, kind: 'list', iterations };
  }

  const shown = [...source].length > 40 ? `${[...source].slice(0, 39).join('')}…` : source;
  return { ok: false, error: `循环来源 ${shown} 不是 range(...) 或 [列表]` };
}

// ---------------------------------------------------------------------------------------------
// Block scanning helpers
// ---------------------------------------------------------------------------------------------

function fenceMarker(trimmed) {
  if (trimmed.startsWith(BACKTICK_FENCE)) return BACKTICK_FENCE;
  if (trimmed.startsWith(TILDE_FENCE)) return TILDE_FENCE;
  return '';
}

function skipFenceFrom(text, lineStart, marker) {
  let cursor = lineEndAt(text, lineStart) + 1;
  while (cursor < text.length) {
    const end = lineEndAt(text, cursor);
    if (text.slice(cursor, end).trim() === marker) return end + 1;
    cursor = end + 1;
  }
  return text.length;
}

function matchingBraceFrom(text, openAt) {
  let depth = 0;
  let cursor = openAt;
  while (cursor < text.length) {
    if (cursor === 0 || text[cursor - 1] === '\n') {
      const marker = fenceMarker(text.slice(cursor, lineEndAt(text, cursor)).trim());
      if (marker) {
        cursor = skipFenceFrom(text, cursor, marker);
        continue;
      }
    }
    if (text[cursor] === '{') depth += 1;
    else if (text[cursor] === '}') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
    cursor += 1;
  }
  return -1;
}

/**
 * Visits each `@for` header in `text`, skipping fenced text and `{ ... }` messages. `descend`
 * decides whether scanning continues inside the loop body or jumps past its closing brace.
 */
function visitLoops(text, visit, descend) {
  let cursor = 0;
  while (cursor < text.length) {
    const end = lineEndAt(text, cursor);
    const rawLine = text.slice(cursor, end);
    const trimmed = rawLine.trim();
    const next = end + 1;
    if (!trimmed) {
      cursor = next;
      continue;
    }
    const contentAt = cursor + rawLine.indexOf(trimmed);
    const marker = fenceMarker(trimmed);
    if (marker) {
      cursor = skipFenceFrom(text, cursor, marker);
      continue;
    }
    if (trimmed.startsWith('{')) {
      const closeAt = matchingBraceFrom(text, contentAt);
      cursor = closeAt < 0 ? text.length : lineEndAt(text, closeAt) + 1;
      continue;
    }
    const header = isLoopHeaderLine(trimmed) ? readLoopHeader(text, contentAt) : null;
    if (header?.ok) {
      const closeAt = matchingBraceFrom(text, header.openAt);
      const stop = closeAt < 0 ? text.length : closeAt + 1;
      visit(header, cursor, stop);
      cursor = descend ? lineEndAt(text, header.openAt) + 1 : stop;
      continue;
    }
    cursor = header ? Math.max(next, header.end + 1) : next;
  }
}

/** `[from, to)` of each outermost `@for` block: header line start through its closing brace. */
export function loopBlockRanges(text) {
  const ranges = [];
  visitLoops(String(text), (_header, from, to) => ranges.push([from, to]), false);
  return ranges;
}

/** Every name bound by a `@for` header anywhere in `text`, nested loops included. */
export function loopHeaderNames(text) {
  const names = [];
  visitLoops(String(text), (header) => names.push(...header.names), true);
  return names;
}

/**
 * {@link substituteTemplate}, except that inside nested `@for` blocks `index` and `count` are left
 * alone: they belong to the innermost loop, which binds them itself when it expands.
 */
export function substituteScoped(text, vars) {
  const ranges = loopBlockRanges(text);
  if (!ranges.length) return substituteTemplate(text, vars);
  const nestedVars = { ...vars };
  for (const alias of LOOP_ALIASES) delete nestedVars[alias];
  let out = '';
  let at = 0;
  for (const [from, to] of ranges) {
    out += substituteTemplate(text.slice(at, from), vars) + substituteTemplate(text.slice(from, to), nestedVars);
    at = to;
  }
  return out + substituteTemplate(text.slice(at), vars);
}
