'use client'

import { where } from 'firebase/firestore'
import { useCollection } from '@/hooks/useFirestore'
import { useAuth } from '@/hooks/useAuth'
import { useMemo } from 'react'
import { getNotesCollection, getNoteSharesCollection } from '@/lib/firebase/firestore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { NoteItem } from '@/features/notes/components/NoteItem'

export function NotesList() {
  const { user } = useAuth()
  const uid = user?.uid ?? ''

  const {
    data: notes,
    loading: notesLoading,
    error: notesError,
    retry: notesRetry,
  } = useCollection(getNotesCollection(), where('uid', '==', uid))

  const {
    data: shares,
    loading: sharesLoading,
    error: sharesError,
    retry: sharesRetry,
  } = useCollection(
    getNoteSharesCollection(),
    where('ownerUid', '==', uid),
    where('revokedAt', '==', null)
  )

  // Map of noteId -> whether any recipient has reviewed it
  const reviewedByNoteId = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const share of shares) {
      if (share.reviewedAt != null) {
        map.set(share.noteId, true)
      }
    }
    return map
  }, [shares])

  if (notesLoading || sharesLoading) return <LoadingSpinner />

  const queryError = notesError ?? sharesError
  if (queryError) {
    return (
      <ErrorState
        title="Couldn't load your notes"
        description={queryError.message}
        onRetry={() => {
          notesRetry()
          sharesRetry()
        }}
      />
    )
  }

  // Firestore cannot query for documents where a field is missing, and notes
  // created before soft-delete existed do not have `deletedAt`. Filter
  // client-side so both old and soft-deleted notes behave correctly.
  const activeNotes = notes.filter((note) => note.deletedAt == null)

  if (activeNotes.length === 0) return <EmptyState title="No notes yet" />

  return (
    <ul className="space-y-2">
      {activeNotes.map((note) => (
        <NoteItem
          key={note.id}
          note={note}
          reviewed={reviewedByNoteId.get(note.id) ?? false}
        />
      ))}
    </ul>
  )
}
