import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAuth } from '@/actions/auth.actions'
import { addNoteComment } from '@/features/notes/actions/comments.actions'

const firestore = vi.hoisted(() => {
  const transactionGet = vi.fn()
  const transactionSet = vi.fn()
  const runTransaction = vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback({ get: transactionGet, set: transactionSet })
  )

  const noteRef = { kind: 'note', id: 'note-1' }
  const shareRef = { kind: 'share', id: 'note-1_recipient-1' }
  const commentRef = { kind: 'comment', id: 'comment-1' }
  const userGet = vi.fn()
  const userRef = { kind: 'user', id: 'owner-1', get: userGet }
  const commentsCollection = { doc: vi.fn(() => commentRef) }

  const collection = vi.fn((name: string) => {
    if (name === 'notes') return { doc: vi.fn(() => noteRef) }
    if (name === 'noteShares') return { doc: vi.fn(() => shareRef) }
    if (name === 'noteComments') return commentsCollection
    return { doc: vi.fn(() => userRef) }
  })

  return {
    transactionGet,
    transactionSet,
    runTransaction,
    noteRef,
    shareRef,
    commentRef,
    userRef,
    userGet,
    commentsCollection,
    collection,
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
  firestore.userGet.mockReset()
  firestore.commentsCollection.doc.mockClear()

  firestore.userGet.mockResolvedValue({ data: () => ({ displayName: 'Commenter' }) })
})

describe('addNoteComment', () => {
  it('lets the owner add a comment', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      uid: 'owner-1',
      name: 'Owner',
      email: 'owner@example.com',
    } as never)
    firestore.transactionGet.mockResolvedValueOnce(snapshot({ uid: 'owner-1', deletedAt: null }))

    const result = await addNoteComment({ noteId: 'note-1', body: '  Looks good  ' })

    expect(result).toEqual({ success: true, data: 'comment-1' })
    expect(firestore.transactionGet).toHaveBeenCalledTimes(1)
    expect(firestore.transactionGet).toHaveBeenCalledWith(firestore.noteRef)
    expect(firestore.transactionSet).toHaveBeenCalledWith(
      firestore.commentRef,
      expect.objectContaining({
        noteId: 'note-1',
        authorUid: 'owner-1',
        authorDisplayName: 'Commenter',
        body: 'Looks good',
        createdAt: expect.any(Timestamp),
        updatedAt: expect.any(Timestamp),
        _schemaVersion: 1,
      })
    )
  })

  it('lets an active recipient add a comment', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      uid: 'recipient-1',
      name: 'Recipient',
      email: 'recipient@example.com',
    } as never)
    firestore.transactionGet
      .mockResolvedValueOnce(
        snapshot({ uid: 'owner-1', sharedWithUids: ['recipient-1'], deletedAt: null })
      )
      .mockResolvedValueOnce(
        snapshot({ ownerUid: 'owner-1', recipientUid: 'recipient-1', revokedAt: null })
      )

    const result = await addNoteComment({ noteId: 'note-1', body: 'Thanks for sharing' })

    expect(result).toEqual({ success: true, data: 'comment-1' })
    expect(firestore.transactionGet).toHaveBeenNthCalledWith(1, firestore.noteRef)
    expect(firestore.transactionGet).toHaveBeenNthCalledWith(2, firestore.shareRef)
  })

  it('refuses a user who is not the owner or a recipient', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ uid: 'stranger-1' } as never)
    firestore.transactionGet.mockResolvedValueOnce(
      snapshot({ uid: 'owner-1', sharedWithUids: ['recipient-1'], deletedAt: null })
    )

    const result = await addNoteComment({ noteId: 'note-1', body: 'Hello' })

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.transactionSet).not.toHaveBeenCalled()
  })

  it('refuses a recipient whose share has been revoked', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ uid: 'recipient-1' } as never)
    firestore.transactionGet
      .mockResolvedValueOnce(
        snapshot({ uid: 'owner-1', sharedWithUids: ['recipient-1'], deletedAt: null })
      )
      .mockResolvedValueOnce(
        snapshot({
          ownerUid: 'owner-1',
          recipientUid: 'recipient-1',
          revokedAt: Timestamp.now(),
        })
      )

    const result = await addNoteComment({ noteId: 'note-1', body: 'Hello' })

    expect(result).toEqual({ success: false, error: 'Share not found' })
    expect(firestore.transactionSet).not.toHaveBeenCalled()
  })

  it('refuses to comment on a soft-deleted note', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ uid: 'owner-1' } as never)
    firestore.transactionGet.mockResolvedValueOnce(
      snapshot({ uid: 'owner-1', deletedAt: Timestamp.now() })
    )

    const result = await addNoteComment({ noteId: 'note-1', body: 'Hello' })

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.transactionSet).not.toHaveBeenCalled()
  })

  it('returns not found when the note does not exist', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ uid: 'owner-1' } as never)
    firestore.transactionGet.mockResolvedValueOnce(snapshot(null))

    const result = await addNoteComment({ noteId: 'missing-note', body: 'Hello' })

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.transactionSet).not.toHaveBeenCalled()
  })

  it('rejects an empty comment before touching Firestore', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ uid: 'owner-1' } as never)

    const result = await addNoteComment({ noteId: 'note-1', body: '   ' })

    expect(result).toEqual({ success: false, error: 'Comment cannot be empty' })
    expect(firestore.runTransaction).not.toHaveBeenCalled()
  })

  it('rejects a comment over the length limit before touching Firestore', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ uid: 'owner-1' } as never)

    const result = await addNoteComment({ noteId: 'note-1', body: 'a'.repeat(2001) })

    expect(result).toMatchObject({ success: false })
    expect(result.error).toContain('2000')
    expect(firestore.runTransaction).not.toHaveBeenCalled()
  })

  it('falls back to the session email when the profile has no display name', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      uid: 'owner-1',
      name: '',
      email: 'owner@example.com',
    } as never)
    firestore.userGet.mockResolvedValue({ data: () => ({ displayName: null }) })
    firestore.transactionGet.mockResolvedValueOnce(snapshot({ uid: 'owner-1', deletedAt: null }))

    const result = await addNoteComment({ noteId: 'note-1', body: 'Hello' })

    expect(result.success).toBe(true)
    expect(firestore.transactionSet).toHaveBeenCalledWith(
      firestore.commentRef,
      expect.objectContaining({ authorDisplayName: 'owner@example.com' })
    )
  })
})
