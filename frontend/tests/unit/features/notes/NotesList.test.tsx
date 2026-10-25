import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function mockCollection(data: Note[], loading = false, error: Error | null = null) {
  vi.mocked(useCollection).mockReturnValue({ data, loading, error, retry: vi.fn() })
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

  it('shows a retryable error state when the query fails', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    vi.mocked(useCollection).mockReturnValue({
      data: [],
      loading: false,
      error: new Error('permission-denied'),
      retry,
    })

    render(<NotesList />)

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your notes")
    expect(screen.getByText('permission-denied')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
