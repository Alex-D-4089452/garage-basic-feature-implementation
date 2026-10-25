'use client'

import { Modal } from '@/components/shared/Modal'
import { NoteComments } from '@/features/notes/components/NoteComments'
import type { Note } from '@/types/firestore'

interface NoteCommentsDialogProps {
  note: Note
  open: boolean
  onClose: () => void
}

export function NoteCommentsDialog({ note, open, onClose }: NoteCommentsDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title="Comments" description={note.title}>
      <NoteComments noteId={note.id} />
    </Modal>
  )
}
