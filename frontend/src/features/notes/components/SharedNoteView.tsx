'use client'

import { Modal } from '@/components/shared/Modal'
import type { Note } from '@/types/firestore'

interface SharedNoteViewProps {
  note: Note | null
  unavailable?: boolean
  ownerDisplayName?: string
  onClose: () => void
}

export function SharedNoteView({
  note,
  unavailable = false,
  ownerDisplayName,
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
            <p className="text-xs tracking-wide text-zinc-400 uppercase">View only</p>
          </div>
        )
      )}
    </Modal>
  )
}
