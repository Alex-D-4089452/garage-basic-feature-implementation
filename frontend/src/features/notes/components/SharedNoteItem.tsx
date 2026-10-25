import { Check, Eye } from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { cn } from '@/lib/utils'
import type { Note } from '@/types/firestore'

interface SharedNoteItemProps {
  note: Note
  ownerDisplayName: string
  reviewed: boolean
  reviewPending: boolean
  onToggleReviewed: () => void
  onView: () => void
}

export function SharedNoteItem({
  note,
  ownerDisplayName,
  reviewed,
  reviewPending,
  onToggleReviewed,
  onView,
}: SharedNoteItemProps) {
  return (
    <li className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-medium break-words">{note.title}</h3>
          <p className="text-xs text-zinc-500">Shared by {ownerDisplayName}</p>
          {note.body && (
            <p className="line-clamp-2 text-sm break-words whitespace-pre-wrap text-zinc-500">
              {note.body}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onToggleReviewed}
            disabled={reviewPending}
            aria-pressed={reviewed}
            aria-label={
              reviewed ? `Mark ${note.title} as not reviewed` : `Mark ${note.title} as reviewed`
            }
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              reviewed
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950'
                : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
            )}
          >
            {reviewPending ? (
              <LoadingSpinner size="sm" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {reviewPending ? 'Saving…' : reviewed ? 'Reviewed' : 'Review'}
          </button>

          <button
            type="button"
            onClick={onView}
            aria-label={`View ${note.title}`}
            className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            View
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-zinc-400">View only</p>
    </li>
  )
}
