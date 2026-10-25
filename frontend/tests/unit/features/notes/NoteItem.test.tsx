import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { NoteItem } from '@/features/notes/components/NoteItem'
import { deleteNote, updateNote } from '@/features/notes/actions/notes.actions'
import type { Note } from '@/types/firestore'

vi.mock('@/features/notes/actions/notes.actions', () => ({
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const baseNote = {
  uid: 'owner-1',
  body: 'Plan body',
  createdAt: Timestamp.fromMillis(0),
  updatedAt: Timestamp.fromMillis(0),
  _schemaVersion: 1 as const,
}

const note: Note = { ...baseNote, id: 'note-1', title: 'Shared plan' }

const sharedNote: Note = {
  ...baseNote,
  id: 'note-2',
  title: 'Shared plan',
  sharedWithUids: ['user-2'],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NoteItem', () => {
  it('renders note title and body', () => {
    render(<NoteItem note={note} />)

    expect(screen.getByText('Shared plan')).toBeInTheDocument()
    expect(screen.getByText('Plan body')).toBeInTheDocument()
  })

  it('shows "Shared with X people" when note is shared', () => {
    render(<NoteItem note={sharedNote} />)

    expect(screen.getByText('Shared with 1 person')).toBeInTheDocument()
  })

  it('shows green "Reviewed" badge when reviewed prop is true', () => {
    render(<NoteItem note={sharedNote} reviewed={true} />)

    expect(screen.getByText('Reviewed')).toBeInTheDocument()
    expect(screen.getByTestId('reviewed-check-icon')).toBeInTheDocument()
  })

  it('does not show review badge when reviewed prop is false', () => {
    render(<NoteItem note={sharedNote} reviewed={false} />)

    expect(screen.queryByText('Reviewed')).not.toBeInTheDocument()
  })

  it('does not show review badge when reviewed prop is undefined', () => {
    render(<NoteItem note={sharedNote} />)

    expect(screen.queryByText('Reviewed')).not.toBeInTheDocument()
  })

  it('shows Share, Comments, Edit, Delete buttons', () => {
    render(<NoteItem note={note} />)

    expect(screen.getByRole('button', { name: /share shared plan/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /comments for shared plan/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit shared plan/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete shared plan/i })).toBeInTheDocument()
  })
})