import type { Metadata } from 'next'
import { requireAuth } from '@/actions/auth.actions'
import { PageHeader } from '@/components/layout/PageHeader'
import { CreateNoteForm } from '@/features/notes/components/CreateNoteForm'
import { NotesList } from '@/features/notes/components/NotesList'
import { NotesTabs } from '@/features/notes/components/NotesTabs'
import { SharedNotesList } from '@/features/notes/components/SharedNotesList'

export const metadata: Metadata = { title: 'Notes' }

export default async function NotesPage() {
  await requireAuth()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notes"
        description="Your personal notes and notes other people have shared with you"
      />
      <NotesTabs
        myNotes={
          <div className="space-y-6">
            <CreateNoteForm />
            <NotesList />
          </div>
        }
        sharedNotes={<SharedNotesList />}
      />
    </div>
  )
}
