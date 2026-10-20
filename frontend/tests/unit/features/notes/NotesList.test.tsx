import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { NotesList } from '@/features/notes/components/NotesList'
import { useCollection } from '@/hooks/useFirestore'
import type { Note } from '@/types/firestore'

vi.mock('@/hooks/useFirestore', () => ({
  useCollection: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('@/lib/firebase/firestore', () => ({
  getNotesCollection: () => ({}),
}))

vi.mock('@/features/notes/actions/notes.actions', () => ({
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const baseNote = {
  uid: 'user-1',
  body: 'Body',
  createdAt: Timestamp.fromMillis(0),
  updatedAt: Timestamp.fromMillis(0),
  _schemaVersion: 1 as const,
}

const activeNote: Note = { ...baseNote, id: 'active-1', title: 'Active note' }

const deletedNote: Note = {
  ...baseNote,
  id: 'deleted-1',
  title: 'Deleted note',
  deletedAt: Timestamp.fromMillis(1),
}

function mockCollection(data: Note[], loading = false) {
  vi.mocked(useCollection).mockReturnValue({ data, loading, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotesList', () => {
  it('renders only active notes', () => {
    mockCollection([activeNote, deletedNote])
    render(<NotesList />)

    expect(screen.getByText('Active note')).toBeInTheDocument()
    expect(screen.queryByText('Deleted note')).not.toBeInTheDocument()
  })

  it('shows the empty state when every note is soft-deleted', () => {
    mockCollection([deletedNote])
    render(<NotesList />)

    expect(screen.getByText('No notes yet')).toBeInTheDocument()
  })

  it('shows a loading spinner while notes load', () => {
    mockCollection([], true)
    render(<NotesList />)

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })
})
