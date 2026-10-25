import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'
import { SharedNotesList } from '@/features/notes/components/SharedNotesList'
import { useCollection } from '@/hooks/useFirestore'
import type { Note, NoteShare } from '@/types/firestore'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'recipient-1' } }),
}))

vi.mock('@/hooks/useFirestore', () => ({
  useCollection: vi.fn(),
}))

vi.mock('@/lib/firebase/firestore', () => ({
  getNotesCollection: () => ({ path: 'notes' }),
  getNoteSharesCollection: () => ({ path: 'noteShares' }),
}))

const baseNote: Note = {
  id: 'note-1',
  uid: 'owner-1',
  title: 'Shared plan',
  body: 'Plan body',
  createdAt: Timestamp.fromMillis(0),
  updatedAt: Timestamp.fromMillis(0),
  sharedWithUids: ['recipient-1'],
  _schemaVersion: 1,
}

const share: NoteShare = {
  id: 'note-1_recipient-1',
  noteId: 'note-1',
  ownerUid: 'owner-1',
  recipientUid: 'recipient-1',
  recipientEmail: 'recipient@example.com',
  ownerDisplayName: 'Alice',
  createdAt: Timestamp.fromMillis(0),
  updatedAt: Timestamp.fromMillis(0),
  revokedAt: null,
  _schemaVersion: 1,
}

interface QueryState<T> {
  data: T[]
  loading?: boolean
  error?: Error | null
  retry?: () => void
}

function mockQueries(notes: QueryState<Note>, shares: QueryState<NoteShare> = { data: [share] }) {
  const notesResult = {
    data: notes.data,
    loading: notes.loading ?? false,
    error: notes.error ?? null,
    retry: notes.retry ?? vi.fn(),
  }
  const sharesResult = {
    data: shares.data,
    loading: shares.loading ?? false,
    error: shares.error ?? null,
    retry: shares.retry ?? vi.fn(),
  }

  vi.mocked(useCollection).mockImplementation((collectionRef) => {
    const path = (collectionRef as unknown as { path: string }).path
    return path === 'notes' ? notesResult : sharesResult
  })

  return { notesResult, sharesResult }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SharedNotesList', () => {
  it('shows a loading spinner while the live queries resolve', () => {
    mockQueries({ data: [], loading: true }, { data: [], loading: true })
    render(<SharedNotesList />)

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('shows the empty state when nobody has shared a note', () => {
    mockQueries({ data: [] }, { data: [] })
    render(<SharedNotesList />)

    expect(screen.getByText('No shared notes')).toBeInTheDocument()
  })

  it('renders the note owner and view-only label', () => {
    mockQueries({ data: [baseNote] })
    render(<SharedNotesList />)

    expect(screen.getByText('Shared plan')).toBeInTheDocument()
    expect(screen.getByText('Shared by Alice')).toBeInTheDocument()
    expect(screen.getByText('View only')).toBeInTheDocument()
  })

  it('falls back when the share record has no owner display name', () => {
    mockQueries({ data: [baseNote] }, { data: [] })
    render(<SharedNotesList />)

    expect(screen.getByText('Shared by the note owner')).toBeInTheDocument()
  })

  it('opens a read-only view of the shared note', async () => {
    const user = userEvent.setup()
    mockQueries({ data: [baseNote] })

    render(<SharedNotesList />)
    await user.click(screen.getByRole('button', { name: 'View Shared plan' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Plan body')).toBeInTheDocument()
    expect(within(dialog).getByText('Shared by Alice')).toBeInTheDocument()
    expect(within(dialog).getByText('View only')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('filters soft-deleted notes out of the list', () => {
    const deletedNote: Note = {
      ...baseNote,
      id: 'note-2',
      title: 'Deleted shared note',
      deletedAt: Timestamp.fromMillis(1),
    }
    mockQueries({ data: [baseNote, deletedNote] })

    render(<SharedNotesList />)

    expect(screen.getByText('Shared plan')).toBeInTheDocument()
    expect(screen.queryByText('Deleted shared note')).not.toBeInTheDocument()
  })

  it('switches to an unavailable alert when access is revoked while viewing', async () => {
    const user = userEvent.setup()
    mockQueries({ data: [baseNote] })
    const { rerender } = render(<SharedNotesList />)

    await user.click(screen.getByRole('button', { name: 'View Shared plan' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    mockQueries({ data: [] }, { data: [] })
    rerender(<SharedNotesList />)

    expect(screen.getByText('Note unavailable')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to list' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a retryable error and retries both live queries', async () => {
    const user = userEvent.setup()
    const notesRetry = vi.fn()
    const sharesRetry = vi.fn()
    mockQueries(
      { data: [], error: new Error('permission-denied'), retry: notesRetry },
      { data: [], retry: sharesRetry }
    )

    render(<SharedNotesList />)

    expect(screen.getByText("Couldn't load shared notes")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(notesRetry).toHaveBeenCalledTimes(1)
    expect(sharesRetry).toHaveBeenCalledTimes(1)
  })
})
