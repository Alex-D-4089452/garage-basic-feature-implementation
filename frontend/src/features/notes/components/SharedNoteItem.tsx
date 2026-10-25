import { Eye } from 'lucide-react'
import type { Note } from '@/types/firestore'

interface SharedNoteItemProps {
  note: Note
  ownerDisplayName: string
  onView: () => void
}

export function SharedNoteItem({ note, ownerDisplayName, onView }: SharedNoteItemProps) {
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

        <button
          type="button"
          onClick={onView}
          aria-label={`View ${note.title}`}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          <Eye className="h-4 w-4" />
          View
        </button>
      </div>

      <p className="mt-2 text-xs text-zinc-400">View only</p>
    </li>
  )
}
