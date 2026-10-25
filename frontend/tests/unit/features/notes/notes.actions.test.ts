import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAuth } from '@/actions/auth.actions'
import { deleteNote, updateNote } from '@/features/notes/actions/notes.actions'

const firestore = vi.hoisted(() => {
  const get = vi.fn()
  const update = vi.fn()
  const noteRef = { kind: 'note', id: 'note-1', get, update }
  const doc = vi.fn(() => noteRef)

  const sharesGet = vi.fn()
  const sharesWhere = vi.fn()
  const sharesQuery = { where: sharesWhere, get: sharesGet }
  sharesWhere.mockReturnValue(sharesQuery)

  const transactionGet = vi.fn()
  const transactionUpdate = vi.fn()
  const runTransaction = vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback({ get: transactionGet, update: transactionUpdate })
  )

  const collection = vi.fn((name: string) => {
    if (name === 'noteShares') return sharesQuery
    return { doc }
  })

  return {
    get,
    update,
    noteRef,
    doc,
    collection,
    sharesWhere,
    sharesGet,
    transactionGet,
    transactionUpdate,
    runTransaction,
  }
})

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: firestore.collection, runTransaction: firestore.runTransaction },
}))

vi.mock('@/actions/auth.actions', () => ({
  requireAuth: vi.fn(),
}))

function snapshot(data: Record<string, unknown> | null) {
  return { exists: data !== null, data: () => data ?? undefined }
}

beforeEach(() => {
  vi.clearAllMocks()
  firestore.transactionGet.mockReset()
  vi.mocked(requireAuth).mockResolvedValue({ uid: 'user-1' } as never)
})

describe('updateNote', () => {
  it('updates a note owned by the signed-in user', async () => {
    firestore.get.mockResolvedValue(snapshot({ uid: 'user-1' }))
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
    firestore.get.mockResolvedValue(snapshot({ uid: 'user-2' }))

    const result = await updateNote({ id: 'note-1', title: 'Hijacked', body: '' })

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.update).not.toHaveBeenCalled()
  })

  it('refuses to update a soft-deleted note', async () => {
    firestore.get.mockResolvedValue(snapshot({ uid: 'user-1', deletedAt: Timestamp.now() }))

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
  it('soft-deletes a note, clears sharing access, and revokes active shares', async () => {
    const shareRef = { kind: 'share', id: 'note-1_user-2' }
    firestore.transactionGet
      .mockResolvedValueOnce(snapshot({ uid: 'user-1', sharedWithUids: ['user-2'] }))
      .mockResolvedValueOnce({ docs: [{ ref: shareRef }] })

    const result = await deleteNote('note-1')

    expect(result).toEqual({ success: true })
    expect(firestore.collection).toHaveBeenCalledWith('noteShares')
    expect(firestore.sharesWhere).toHaveBeenNthCalledWith(1, 'noteId', '==', 'note-1')
    expect(firestore.sharesWhere).toHaveBeenNthCalledWith(2, 'revokedAt', '==', null)
    expect(firestore.transactionGet).toHaveBeenNthCalledWith(1, firestore.noteRef)
    expect(firestore.transactionUpdate).toHaveBeenNthCalledWith(1, firestore.noteRef, {
      deletedAt: expect.any(Timestamp),
      updatedAt: expect.any(Timestamp),
      sharedWithUids: [],
    })
    expect(firestore.transactionUpdate).toHaveBeenNthCalledWith(2, shareRef, {
      revokedAt: expect.any(Timestamp),
      updatedAt: expect.any(Timestamp),
    })
    expect(firestore.runTransaction).toHaveBeenCalledTimes(1)
  })

  it('refuses to delete a note owned by someone else', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot({ uid: 'user-2' }))

    const result = await deleteNote('note-1')

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.transactionUpdate).not.toHaveBeenCalled()
  })

  it('returns not found when the note does not exist', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot(null))

    const result = await deleteNote('missing-note')

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.transactionUpdate).not.toHaveBeenCalled()
  })

  it('refuses to delete an already soft-deleted note', async () => {
    firestore.transactionGet.mockResolvedValueOnce(
      snapshot({ uid: 'user-1', deletedAt: Timestamp.now() })
    )

    const result = await deleteNote('note-1')

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.transactionUpdate).not.toHaveBeenCalled()
  })

  it('rejects an invalid note id before touching Firestore', async () => {
    const result = await deleteNote('')

    expect(result).toEqual({ success: false, error: 'Invalid note id' })
    expect(firestore.runTransaction).not.toHaveBeenCalled()
  })
})
