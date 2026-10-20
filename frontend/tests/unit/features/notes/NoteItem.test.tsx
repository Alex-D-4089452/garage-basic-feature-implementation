import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { NoteItem } from '@/features/notes/components/NoteItem'
import { deleteNote, updateNote } from '@/features/notes/actions/notes.actions'
import type { Note } from '@/types/firestore'

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

const note: Note = {
  id: 'note-1',
  uid: 'user-1',
  title: 'Original title',
  body: 'Original body',
  createdAt: Timestamp.fromMillis(0),
  updatedAt: Timestamp.fromMillis(0),
  _schemaVersion: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NoteItem', () => {
  it('renders the note title and body', () => {
    render(<NoteItem note={note} />)

    expect(screen.getByText('Original title')).toBeInTheDocument()
    expect(screen.getByText('Original body')).toBeInTheDocument()
  })

  it('updates a note and returns to read mode', async () => {
    const user = userEvent.setup()
    vi.mocked(updateNote).mockResolvedValue({ success: true })

    render(<NoteItem note={note} />)
    await user.click(screen.getByRole('button', { name: 'Edit Original title' }))

    const titleInput = screen.getByLabelText('Title')
    const bodyInput = screen.getByLabelText('Body')

    await user.clear(titleInput)
    await user.type(titleInput, 'Updated title')
    await user.clear(bodyInput)
    await user.type(bodyInput, 'Updated body')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith({
        id: 'note-1',
        title: 'Updated title',
        body: 'Updated body',
      })
    })
    expect(toast.success).toHaveBeenCalledWith('Note updated')
    expect(screen.getByRole('button', { name: 'Edit Original title' })).toBeInTheDocument()
  })

  it('stays in edit mode and shows an error when the update fails', async () => {
    const user = userEvent.setup()
    vi.mocked(updateNote).mockResolvedValue({ success: false, error: 'Note not found' })

    render(<NoteItem note={note} />)
    await user.click(screen.getByRole('button', { name: 'Edit Original title' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Note not found')
    })
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('does not submit an empty title', async () => {
    const user = userEvent.setup()

    render(<NoteItem note={note} />)
    await user.click(screen.getByRole('button', { name: 'Edit Original title' }))
    await user.clear(screen.getByLabelText('Title'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(updateNote).not.toHaveBeenCalled()
  })

  it('soft-deletes a note after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteNote).mockResolvedValue({ success: true })

    render(<NoteItem note={note} />)
    await user.click(screen.getByRole('button', { name: 'Delete Original title' }))
    expect(screen.getByText('Delete this note?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() => {
      expect(deleteNote).toHaveBeenCalledWith('note-1')
    })
    expect(toast.success).toHaveBeenCalledWith('Note deleted')
  })

  it('cancels a delete without calling the action', async () => {
    const user = userEvent.setup()

    render(<NoteItem note={note} />)
    await user.click(screen.getByRole('button', { name: 'Delete Original title' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Delete this note?')).not.toBeInTheDocument()
    expect(deleteNote).not.toHaveBeenCalled()
  })

  it('shows an error when the delete fails', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteNote).mockResolvedValue({ success: false, error: 'Note not found' })

    render(<NoteItem note={note} />)
    await user.click(screen.getByRole('button', { name: 'Delete Original title' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Note not found')
    })
  })
})
