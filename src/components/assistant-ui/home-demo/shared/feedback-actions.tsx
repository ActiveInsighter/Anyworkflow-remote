import { useRef, useState, useEffect, type ReactNode } from 'react'
import { useAui, useAuiState } from '@assistant-ui/react'
import { ThumbsUpIcon, ThumbsDownIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDemoIntegration } from '../integration'
import { FeedbackPopover, type FeedbackCategory } from './feedback-popover'
export function FeedbackActions({ onOpenChange }: { surface?: string; onOpenChange?: (open: boolean) => void }): ReactNode {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const feedbackSubmissionStartedRef = useRef<string | null>(null)
  const aui = useAui()
  const { submitFeedback } = useDemoIntegration()
  const messageId = useAuiState(s => s.message.id)
  const submittedFeedback = useAuiState(s => s.message.metadata.submittedFeedback?.type)
  const canPersist = useAuiState(s => Boolean(s.message.metadata.custom.geminiJob))
  const content = useAuiState(s => s.message.content)
  const isRunning = useAuiState(s => s.message.status?.type === 'running')
  useEffect(() => () => onOpenChange?.(false), [onOpenChange])
  if (isRunning || !canPersist || !content.some(p => p.type === 'text' && p.text.trim())) return null
  const setOpen = (open: boolean) => { setPopoverOpen(open); onOpenChange?.(open) }
  const submit = async (type: 'positive' | 'negative', comment?: string) => {
    if (submittedFeedback || feedbackSubmissionStartedRef.current === messageId) return
    feedbackSubmissionStartedRef.current = messageId
    try { await submitFeedback(messageId, type, comment); aui.message.submitFeedback({type, comment}) }
    catch { feedbackSubmissionStartedRef.current = null; toast.error('Failed to submit feedback. Please try again.') }
  }
  const handlePositiveFeedback = () => { void submit('positive') }
  const handleNegativeFeedback = (category: FeedbackCategory, comment?: string) => { void submit('negative', [category, comment].filter(Boolean).join(': ')) }
  return (
    <>
      <button
        type="button"
        onClick={handlePositiveFeedback}
        disabled={!!submittedFeedback}
        aria-label={
          submittedFeedback === "positive"
            ? "Positive feedback submitted"
            : "Good response"
        }
        className={cn(
          "text-muted-foreground hover:text-foreground p-1 transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          submittedFeedback === "positive" && "text-foreground",
        )}
      >
        <ThumbsUpIcon className="size-4" />
      </button>

      <FeedbackPopover
        open={popoverOpen}
        onOpenChange={setOpen}
        onSubmit={handleNegativeFeedback}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!!submittedFeedback}
          aria-label={
            submittedFeedback === "negative"
              ? "Negative feedback submitted"
              : "Report issue with response"
          }
          className={cn(
            "text-muted-foreground hover:text-foreground p-1 transition-colors",
            "disabled:cursor-not-allowed disabled:opacity-50",
            submittedFeedback === "negative" && "text-foreground",
          )}
        >
          <ThumbsDownIcon className="size-4" />
        </button>
      </FeedbackPopover>
    </>
  );
}
