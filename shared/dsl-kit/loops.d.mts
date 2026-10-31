/** Types for loops.mjs, the shared `@for` implementation (see the module comment there). */

export type LoopScalar = string | number
export type LoopVars = Record<string, LoopScalar>
export type LoopValue = string | { list: LoopValue[] } | { tuple: LoopValue[] }

export interface LoopHeader {
  ok: true
  /** Variable names in header order, e.g. `['ch', 'title']`. */
  names: string[]
  /** The source as written: `range(...)`, `[ ... ]` (possibly spanning lines) or `%name%`. */
  source: string
  /** Offset of the `@` that starts the header. */
  from: number
  /** Offset of the `{` that opens the body. */
  openAt: number
}

export interface LoopHeaderError {
  ok: false
  error: string
  /** Offset of the end of the line where scanning may resume. */
  end: number
}

export type LoopExpansion =
  | { ok: true; kind: 'range' | 'list'; iterations: LoopVars[] }
  | { ok: false; error: string }

export declare const LOOP_ALIASES: readonly ['index', 'count']
export declare const MAX_LOOP_NAMES: number

export declare function isLoopHeaderLine(trimmed: string): boolean
export declare function readLoopHeader(text: string, at: number): LoopHeader | LoopHeaderError | null
export declare function expandLoop(
  header: Pick<LoopHeader, 'names' | 'source'>,
  vars?: LoopVars,
  options?: { maxItems?: number },
): LoopExpansion
export declare function parseLoopList(text: string): { ok: true; items: LoopValue[] } | { ok: false; error: string; at: number }
export declare function formatLoopValue(value: LoopValue): string
export declare function formatTemplateValue(value: LoopScalar, format: string | undefined): string | null
export declare function substituteTemplate(text: string, vars: LoopVars): string
export declare function substituteScoped(text: string, vars: LoopVars): string
export declare function loopBlockRanges(text: string): Array<[number, number]>
export declare function loopHeaderNames(text: string): string[]
