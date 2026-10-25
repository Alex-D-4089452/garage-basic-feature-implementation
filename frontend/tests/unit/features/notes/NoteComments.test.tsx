import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { NoteComments } from '@/features/notes/components/NoteComments'
import { addNoteComment } from '@/features/notes/actions/comments.actions'
import { useCollection } from '@/hooks/useFirestore'
import type { NoteComment } from '@/types/firestore'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('@/hooks/useFirestore', () => ({
  useCollection: vi.fn(),
}))

vi.mock('@/lib/firebase/firestore', () => ({
  getNoteCommentsCollection: () => ({}),
}))

vi.mock('@/features/notes/actions/comments.actions', () => ({
  addNoteComment: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const comment: NoteComment = {
  id: 'comment-1',
  noteId: 'note-1',
  authorUid: 'user-1',
  authorDisplayName: 'Commenter',
  body: 'First comment',
  createdAt: Timestamp.fromMillis(0),
  updatedAt: Timestamp.fromMillis(0),
  _schemaVersion: 1,
}

function mockComments(
  data: NoteComment[],
  overrides: Partial<ReturnType<typeof useCollection>> = {}
) {
  vi.mocked(useCollection).mockReturnValue({
    data,
    loading: false,
    error: null,
    retry: vi.fn(),
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockComments([])
})

describe('NoteComments', () => {
  it('shows a loading state while comments load', () => {
    mockComments([], { loading: true })
    render(<NoteComments noteId="note-1" />)

    expect(screen.getByText('Loading comments…')).toBeInTheDocument()
  })

  it('shows the empty state when there are no comments', () => {
    render(<NoteComments noteId="note-1" />)

    expect(screen.getByText('No comments yet. Start the conversation.')).toBeInTheDocument()
  })

  it('renders comments with author names and marks the current user', () => {
    mockComments([
      comment,
      {
        ...comment,
        id: 'comment-2',
        authorUid: 'user-2',
        authorDisplayName: 'Alice',
        body: 'Second comment',
      },
    ])

    render(<NoteComments noteId="note-1" />)

    expect(screen.getByText('First comment')).toBeInTheDocument()
    expect(screen.getByText('Second comment')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows a retryable error when comments cannot be loaded', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    mockComments([], { error: new Error('permission-denied'), retry })

    render(<NoteComments noteId="note-1" />)

    expect(screen.getByText("Couldn't load comments")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('adds a comment and clears the form', async () => {
    const user = userEvent.setup()
    vi.mocked(addNoteComment).mockResolvedValue({ success: true, data: 'comment-2' })

    render(<NoteComments noteId="note-1" />)
    const textarea = screen.getByLabelText('Add a comment')
    await user.type(textarea, 'Hello there')
    await user.click(screen.getByRole('button', { name: 'Add comment' }))

    await waitFor(() => {
      expect(addNoteComment).toHaveBeenCalledWith({ noteId: 'note-1', body: 'Hello there' })
    })
    expect(toast.success).toHaveBeenCalledWith('Comment added')
    await waitFor(() => expect(textarea).toHaveValue(''))
  })

  it('shows a server error when adding a comment fails', async () => {
    const user = userEvent.setup()
    vi.mocked(addNoteComment).mockResolvedValue({
      success: false,
      error: 'Failed to add comment',
    })

    render(<NoteComments noteId="note-1" />)
    await user.type(screen.getByLabelText('Add a comment'), 'Hello there')
    await user.click(screen.getByRole('button', { name: 'Add comment' }))

    expect(await screen.findByText('Failed to add comment')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('Failed to add comment')
  })

  it('does not submit an empty comment', async () => {
    const user = userEvent.setup()
    render(<NoteComments noteId="note-1" />)

    await user.click(screen.getByRole('button', { name: 'Add comment' }))

    expect(await screen.findByText('Comment cannot be empty')).toBeInTheDocument()
    expect(addNoteComment).not.toHaveBeenCalled()
  })
})
