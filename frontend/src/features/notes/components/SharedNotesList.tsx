'use client'

import { useMemo, useState } from 'react'
import { where } from 'firebase/firestore'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useCollection } from '@/hooks/useFirestore'
import { getNotesCollection, getNoteSharesCollection } from '@/lib/firebase/firestore'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SharedNoteItem } from '@/features/notes/components/SharedNoteItem'
import { SharedNoteView } from '@/features/notes/components/SharedNoteView'
import { setNoteReviewed } from '@/features/notes/actions/sharing.actions'
import type { Note, NoteShare } from '@/types/firestore'

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
  const [reviewingNoteId, setReviewingNoteId] = useState<string | null>(null)

  const sharesByNoteId = useMemo(() => {
    const shares = new Map<string, NoteShare>()
    for (const share of sharesQuery.data) shares.set(share.noteId, share)
    return shares
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

  const selectedShare = selectedNote ? sharesByNoteId.get(selectedNote.id) : undefined
  const selectedOwnerName =
    selectedNote && !selectedUnavailable
      ? (selectedShare?.ownerDisplayName ?? 'the note owner')
      : undefined

  const onToggleReviewed = async (noteId: string, reviewed: boolean) => {
    setReviewingNoteId(noteId)
    const result = await setNoteReviewed({ noteId, reviewed: !reviewed })
    setReviewingNoteId(null)

    if (result.success) {
      toast.success(reviewed ? 'Marked as not reviewed' : 'Marked as reviewed')
    } else {
      toast.error(result.error ?? 'Failed to update review status')
    }
  }

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
          {notes.map((note) => {
            const share = sharesByNoteId.get(note.id)
            const reviewed = share?.reviewedAt != null

            return (
              <SharedNoteItem
                key={note.id}
                note={note}
                ownerDisplayName={share?.ownerDisplayName ?? 'the note owner'}
                reviewed={reviewed}
                reviewPending={reviewingNoteId === note.id}
                onToggleReviewed={() => onToggleReviewed(note.id, reviewed)}
                onView={() => setSelectedNote(note)}
              />
            )
          })}
        </ul>
      )}

      <SharedNoteView
        note={selectedUnavailable ? null : selectedNote}
        unavailable={selectedUnavailable}
        ownerDisplayName={selectedOwnerName}
        reviewed={selectedShare?.reviewedAt != null}
        reviewPending={selectedNote !== null && reviewingNoteId === selectedNote.id}
        onToggleReviewed={
          selectedNote && selectedShare
            ? () => onToggleReviewed(selectedNote.id, selectedShare.reviewedAt != null)
            : undefined
        }
        onClose={() => setSelectedNote(null)}
      />
    </>
  )
}
