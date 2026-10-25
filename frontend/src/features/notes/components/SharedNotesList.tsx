'use client'

import { useMemo, useState } from 'react'
import { where } from 'firebase/firestore'
import { Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCollection } from '@/hooks/useFirestore'
import { getNotesCollection, getNoteSharesCollection } from '@/lib/firebase/firestore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SharedNoteItem } from '@/features/notes/components/SharedNoteItem'
import { SharedNoteView } from '@/features/notes/components/SharedNoteView'
import type { Note } from '@/types/firestore'

export function SharedNotesList() {
  const { user } = useAuth()
  const uid = user?.uid ?? ''

  const notesQuery = useCollection(
    getNotesCollection(),
    where('sharedWithUids', 'array-contains', uid)
  )
  const sharesQuery = useCollection(
    getNoteSharesCollection(),
    where('recipientUid', '==', uid),
    where('revokedAt', '==', null)
  )

  const [selectedNote, setSelectedNote] = useState<Note | null>(null)

  const ownerNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const share of sharesQuery.data) {
      if (share.ownerDisplayName) names.set(share.noteId, share.ownerDisplayName)
    }
    return names
  }, [sharesQuery.data])

  if (notesQuery.loading || sharesQuery.loading) return <LoadingSpinner />

  const queryError = notesQuery.error ?? sharesQuery.error
  if (queryError) {
    return (
      <ErrorState
        title="Couldn't load shared notes"
        description={queryError.message}
        onRetry={() => {
          notesQuery.retry()
          sharesQuery.retry()
        }}
      />
    )
  }

  // `sharedWithUids` is cleared when a note is soft-deleted, but keep the
  // client-side filter for notes created before this feature shipped.
  const notes = notesQuery.data
    .filter((note) => note.deletedAt == null)
    .sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())

  // If the owner revokes access or deletes the note while the read-only view
  // is open, the live query drops (or soft-deletes) the note. Switch the modal
  // to an explicit "unavailable" state instead of showing stale content.
  const liveSelectedNote = selectedNote
    ? notesQuery.data.find((note) => note.id === selectedNote.id)
    : undefined
  const selectedUnavailable =
    selectedNote !== null && (!liveSelectedNote || liveSelectedNote.deletedAt != null)

  const selectedOwnerName =
    selectedNote && !selectedUnavailable
      ? (ownerNames.get(selectedNote.id) ?? 'the note owner')
      : undefined

  return (
    <>
      {notes.length === 0 ? (
        <EmptyState
          title="No shared notes"
          description="Notes other people share with you will appear here."
          icon={Users}
        />
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <SharedNoteItem
              key={note.id}
              note={note}
              ownerDisplayName={ownerNames.get(note.id) ?? 'the note owner'}
              onView={() => setSelectedNote(note)}
            />
          ))}
        </ul>
      )}

      <SharedNoteView
        note={selectedUnavailable ? null : selectedNote}
        unavailable={selectedUnavailable}
        ownerDisplayName={selectedOwnerName}
        onClose={() => setSelectedNote(null)}
      />
    </>
  )
}
