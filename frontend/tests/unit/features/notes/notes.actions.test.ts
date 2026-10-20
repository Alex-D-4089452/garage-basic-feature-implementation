import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAuth } from '@/actions/auth.actions'
import { deleteNote, updateNote } from '@/features/notes/actions/notes.actions'

const firestore = vi.hoisted(() => {
  const get = vi.fn()
  const update = vi.fn()
  const doc = vi.fn(() => ({ get, update }))
  const collection = vi.fn(() => ({ doc }))
  return { get, update, doc, collection }
})

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: firestore.collection },
}))

vi.mock('@/actions/auth.actions', () => ({
  requireAuth: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAuth).mockResolvedValue({ uid: 'user-1' } as never)
})

describe('updateNote', () => {
  it('updates a note owned by the signed-in user', async () => {
    firestore.get.mockResolvedValue({
      exists: true,
      data: () => ({ uid: 'user-1' }),
    })
    firestore.update.mockResolvedValue(undefined)

    const result = await updateNote({ id: 'note-1', title: 'New title', body: 'New body' })

    expect(result).toEqual({ success: true })
    expect(firestore.collection).toHaveBeenCalledWith('notes')
    expect(firestore.doc).toHaveBeenCalledWith('note-1')
    expect(firestore.update).toHaveBeenCalledWith({
      title: 'New title',
      body: 'New body',
      updatedAt: expect.any(Timestamp),
    })
  })

  it('refuses to update a note owned by someone else', async () => {
    firestore.get.mockResolvedValue({
      exists: true,
      data: () => ({ uid: 'user-2' }),
    })

    const result = await updateNote({ id: 'note-1', title: 'Hijacked', body: '' })

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.update).not.toHaveBeenCalled()
  })

  it('refuses to update a soft-deleted note', async () => {
    firestore.get.mockResolvedValue({
      exists: true,
      data: () => ({ uid: 'user-1', deletedAt: Timestamp.now() }),
    })

    const result = await updateNote({ id: 'note-1', title: 'New title', body: '' })

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.update).not.toHaveBeenCalled()
  })

  it('rejects invalid input before touching Firestore', async () => {
    const result = await updateNote({ id: 'note-1', title: '', body: '' })

    expect(result).toMatchObject({ success: false })
    expect(result.error).toBeTruthy()
    expect(firestore.get).not.toHaveBeenCalled()
  })
})

describe('deleteNote', () => {
  it('soft-deletes a note owned by the signed-in user', async () => {
    firestore.get.mockResolvedValue({
      exists: true,
      data: () => ({ uid: 'user-1' }),
    })
    firestore.update.mockResolvedValue(undefined)

    const result = await deleteNote('note-1')

    expect(result).toEqual({ success: true })
    expect(firestore.update).toHaveBeenCalledWith({
      deletedAt: expect.any(Timestamp),
      updatedAt: expect.any(Timestamp),
    })
  })

  it('refuses to delete a note owned by someone else', async () => {
    firestore.get.mockResolvedValue({
      exists: true,
      data: () => ({ uid: 'user-2' }),
    })

    const result = await deleteNote('note-1')

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.update).not.toHaveBeenCalled()
  })

  it('returns not found when the note does not exist', async () => {
    firestore.get.mockResolvedValue({ exists: false, data: () => undefined })

    const result = await deleteNote('missing-note')

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.update).not.toHaveBeenCalled()
  })

  it('rejects an invalid note id before touching Firestore', async () => {
    const result = await deleteNote('')

    expect(result).toEqual({ success: false, error: 'Invalid note id' })
    expect(firestore.get).not.toHaveBeenCalled()
  })
})
