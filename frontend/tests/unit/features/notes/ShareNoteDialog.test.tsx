import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { ShareNoteDialog } from '@/features/notes/components/ShareNoteDialog'
import { shareNote, unshareNote } from '@/features/notes/actions/sharing.actions'
import { useCollection } from '@/hooks/useFirestore'
import type { Note, NoteShare } from '@/types/firestore'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'owner-1' } }),
}))

vi.mock('@/hooks/useFirestore', () => ({
  useCollection: vi.fn(),
}))

vi.mock('@/lib/firebase/firestore', () => ({
  getNoteSharesCollection: () => ({}),
}))

vi.mock('@/features/notes/actions/sharing.actions', () => ({
  shareNote: vi.fn(),
  unshareNote: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const note: Note = {
  id: 'note-1',
  uid: 'owner-1',
  title: 'Project plan',
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
  ownerDisplayName: 'Owner',
  createdAt: Timestamp.fromMillis(0),
  updatedAt: Timestamp.fromMillis(0),
  revokedAt: null,
  _schemaVersion: 1,
}

function mockShares(data: NoteShare[], overrides: Partial<ReturnType<typeof useCollection>> = {}) {
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
  mockShares([share])
})

describe('ShareNoteDialog', () => {
  it('lists collaborators and explains the view-only scope', () => {
    render(<ShareNoteDialog note={note} open onClose={vi.fn()} />)

    expect(screen.getByText('recipient@example.com')).toBeInTheDocument()
    expect(screen.getByText('View only')).toBeInTheDocument()
    expect(screen.getByText(/shared as view-only/i)).toBeInTheDocument()
  })

  it('shows the empty collaborator state', () => {
    mockShares([])
    render(<ShareNoteDialog note={note} open onClose={vi.fn()} />)

    expect(screen.getByText(/Not shared with anyone yet/i)).toBeInTheDocument()
  })

  it('validates the recipient email before calling the action', async () => {
    const user = userEvent.setup()
    render(<ShareNoteDialog note={note} open onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Share' }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(shareNote).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Recipient email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Share' }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(shareNote).not.toHaveBeenCalled()
  })

  it('shares a valid email and resets the form', async () => {
    const user = userEvent.setup()
    vi.mocked(shareNote).mockResolvedValue({
      success: true,
      data: { recipientUid: 'recipient-2', recipientEmail: 'new@example.com' },
    })

    render(<ShareNoteDialog note={note} open onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Recipient email'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => {
      expect(shareNote).toHaveBeenCalledWith({ noteId: 'note-1', email: 'new@example.com' })
    })
    expect(toast.success).toHaveBeenCalledWith('Shared with new@example.com')
    await waitFor(() => {
      expect(screen.getByLabelText('Recipient email')).toHaveValue('')
    })
  })

  it('shows a server error inline when sharing fails', async () => {
    const user = userEvent.setup()
    vi.mocked(shareNote).mockResolvedValue({
      success: false,
      error: 'That email does not belong to a registered account',
    })

    render(<ShareNoteDialog note={note} open onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Recipient email'), 'missing@example.com')
    await user.click(screen.getByRole('button', { name: 'Share' }))

    expect(
      await screen.findByText('That email does not belong to a registered account')
    ).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('That email does not belong to a registered account')
  })

  it('revokes access for a collaborator', async () => {
    const user = userEvent.setup()
    vi.mocked(unshareNote).mockResolvedValue({ success: true })

    render(<ShareNoteDialog note={note} open onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Remove recipient@example.com' }))

    await waitFor(() => {
      expect(unshareNote).toHaveBeenCalledWith({
        noteId: 'note-1',
        recipientUid: 'recipient-1',
      })
    })
    expect(toast.success).toHaveBeenCalledWith('Removed access for recipient@example.com')
  })

  it('shows a loading state for the collaborator list', () => {
    mockShares([], { loading: true })
    render(<ShareNoteDialog note={note} open onClose={vi.fn()} />)

    expect(screen.getByText('Loading collaborators…')).toBeInTheDocument()
    expect(screen.getByLabelText('Recipient email')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
  })

  it('shows a retryable error when the collaborator query fails', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    mockShares([], { error: new Error('permission-denied'), retry })

    render(<ShareNoteDialog note={note} open onClose={vi.fn()} />)

    expect(screen.getByText("Couldn't load collaborators")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('enforces the 50-person cap in the UI', () => {
    const shares = Array.from({ length: 50 }, (_, index) => ({
      ...share,
      id: `note-1_user-${index}`,
      recipientUid: `user-${index}`,
      recipientEmail: `user-${index}@example.com`,
    }))
    mockShares(shares)

    render(<ShareNoteDialog note={note} open onClose={vi.fn()} />)

    expect(screen.getByText(/reached the 50-person sharing limit/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Recipient email')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
  })

  it('closes from the dialog button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ShareNoteDialog note={note} open onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
