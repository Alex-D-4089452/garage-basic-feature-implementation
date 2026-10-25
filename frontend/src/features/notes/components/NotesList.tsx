'use client'

import { where } from 'firebase/firestore'
import { useCollection } from '@/hooks/useFirestore'
import { useAuth } from '@/hooks/useAuth'
import { getNotesCollection } from '@/lib/firebase/firestore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { NoteItem } from '@/features/notes/components/NoteItem'

export function NotesList() {
  const { user } = useAuth()
  const {
    data: notes,
    loading,
    error,
    retry,
  } = useCollection(getNotesCollection(), where('uid', '==', user?.uid ?? ''))

  if (loading) return <LoadingSpinner />

  if (error) {
    return (
      <ErrorState title="Couldn't load your notes" description={error.message} onRetry={retry} />
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
        <NoteItem key={note.id} note={note} />
      ))}
    </ul>
  )
}
