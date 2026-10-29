import {
  AlignLeft,
  Braces,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Hourglass,
  Link as LinkIcon,
  ListTree,
  Percent,
  Redo2,
  Repeat,
  Search,
  SquareDashedBottomCode,
  SquareStack,
  Trash2,
  Undo2,
  Variable,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { EditorCommandId } from '../lib/editor-command-registry'

/** Presentation of registry commands; behaviour and labels live in the registry. */
export const COMMAND_ICONS: Record<EditorCommandId, LucideIcon> = {
  'insert.task': Workflow,
  'insert.event': Zap,
  'insert.act': SquareStack,
  'insert.loop': Repeat,
  'insert.variable': Variable,
  'insert.variable-ref': Percent,
  'insert.message': Braces,
  'insert.wait': Hourglass,
  'insert.link': LinkIcon,
  'history.undo': Undo2,
  'history.redo': Redo2,
  'clipboard.paste': ClipboardPaste,
  'clipboard.copy': Copy,
  'structure.duplicate': CopyPlus,
  'structure.delete': Trash2,
  'structure.format': AlignLeft,
  'find.search': Search,
  'find.complete': SquareDashedBottomCode,
}

export const OUTLINE_ICON = ListTree
