'use client'

import { Check } from 'lucide-react'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { NoteComments } from '@/features/notes/components/NoteComments'
import { cn } from '@/lib/utils'
import type { Note } from '@/types/firestore'

interface SharedNoteViewProps {
  note: Note | null
  unavailable?: boolean
  ownerDisplayName?: string
  reviewed?: boolean
  reviewPending?: boolean
  onToggleReviewed?: () => void
  onClose: () => void
}

export function SharedNoteView({
  note,
  unavailable = false,
  ownerDisplayName,
  reviewed = false,
  reviewPending = false,
  onToggleReviewed,
  onClose,
}: SharedNoteViewProps) {
  return (
    <Modal
      open={note !== null || unavailable}
      onClose={onClose}
      title={unavailable ? 'Note unavailable' : (note?.title ?? 'Shared note')}
      description={
        unavailable ? undefined : ownerDisplayName ? `Shared by ${ownerDisplayName}` : undefined
      }
    >
      {unavailable ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This note is no longer shared with you. The owner may have removed your access or
            deleted the note.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Back to list
          </button>
        </div>
      ) : (
        note && (
          <div className="space-y-4">
            <p className="text-sm break-words whitespace-pre-wrap">
              {note.body || 'This note has no content.'}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs tracking-wide text-zinc-400 uppercase">View only</p>

              {onToggleReviewed && (
                <button
                  type="button"
                  onClick={onToggleReviewed}
                  disabled={reviewPending}
                  aria-pressed={reviewed}
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
                  {reviewPending ? 'Saving…' : reviewed ? 'Reviewed' : 'Mark as reviewed'}
                </button>
              )}
            </div>

            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <NoteComments noteId={note.id} />
            </div>
          </div>
        )
      )}
    </Modal>
  )
}
