import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAuth } from '@/actions/auth.actions'
import { shareNote, unshareNote } from '@/features/notes/actions/sharing.actions'

const firestore = vi.hoisted(() => {
  const transactionGet = vi.fn()
  const transactionUpdate = vi.fn()
  const transactionSet = vi.fn()
  const runTransaction = vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback({ get: transactionGet, update: transactionUpdate, set: transactionSet })
  )

  const noteRef = { kind: 'note', id: 'note-1' }
  const shareRef = { kind: 'share', id: 'note-1_recipient-1' }
  const userRef = { kind: 'user', id: 'owner-1' }
  const userGet = vi.fn()
  const shareDocIds: string[] = []

  const doc = vi.fn((id: string) => {
    if (id === 'note-1') return noteRef
    if (id.startsWith('note-1_')) {
      shareDocIds.push(id)
      return shareRef
    }
    return userRef
  })

  const collection = vi.fn((name: string) => ({
    doc: (id: string) => (name === 'users' ? { ...userRef, get: userGet } : doc(id)),
  }))

  return {
    transactionGet,
    transactionUpdate,
    transactionSet,
    runTransaction,
    noteRef,
    shareRef,
    userRef,
    userGet,
    shareDocIds,
    doc,
    collection,
  }
})

const auth = vi.hoisted(() => ({ getUserByEmail: vi.fn() }))

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: firestore.collection, runTransaction: firestore.runTransaction },
  adminAuth: auth,
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
  firestore.shareDocIds.length = 0

  vi.mocked(requireAuth).mockResolvedValue({
    uid: 'owner-1',
    name: 'Owner',
    email: 'owner@example.com',
  } as never)
  auth.getUserByEmail.mockResolvedValue({ uid: 'recipient-1', email: 'recipient@example.com' })
  firestore.userGet.mockResolvedValue({ data: () => ({ displayName: 'Owner' }) })
})

describe('shareNote', () => {
  it('shares a note with a registered recipient and records the share', async () => {
    firestore.transactionGet
      .mockResolvedValueOnce(snapshot({ uid: 'owner-1', sharedWithUids: [], deletedAt: null }))
      .mockResolvedValueOnce(snapshot(null))

    const result = await shareNote({ noteId: 'note-1', email: ' Recipient@Example.COM ' })

    expect(result).toEqual({
      success: true,
      data: { recipientUid: 'recipient-1', recipientEmail: 'recipient@example.com' },
    })
    expect(auth.getUserByEmail).toHaveBeenCalledWith('recipient@example.com')
    expect(firestore.transactionGet).toHaveBeenNthCalledWith(1, firestore.noteRef)
    expect(firestore.transactionGet).toHaveBeenNthCalledWith(2, firestore.shareRef)
    expect(firestore.transactionUpdate).toHaveBeenCalledWith(firestore.noteRef, {
      sharedWithUids: ['recipient-1'],
    })
    expect(firestore.transactionSet).toHaveBeenCalledWith(
      firestore.shareRef,
      expect.objectContaining({
        noteId: 'note-1',
        ownerUid: 'owner-1',
        recipientUid: 'recipient-1',
        recipientEmail: 'recipient@example.com',
        ownerDisplayName: 'Owner',
        revokedAt: null,
        _schemaVersion: 1,
        createdAt: expect.any(Timestamp),
        updatedAt: expect.any(Timestamp),
      })
    )
  })

  it('rejects an invalid email before calling Firebase Auth', async () => {
    const result = await shareNote({ noteId: 'note-1', email: 'not-an-email' })

    expect(result).toEqual({ success: false, error: 'Enter a valid email address' })
    expect(auth.getUserByEmail).not.toHaveBeenCalled()
    expect(firestore.runTransaction).not.toHaveBeenCalled()
  })

  it('returns not found for a note the caller does not own', async () => {
    firestore.transactionGet.mockResolvedValueOnce(
      snapshot({ uid: 'someone-else', sharedWithUids: [] })
    )

    const result = await shareNote({ noteId: 'note-1', email: 'recipient@example.com' })

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.transactionUpdate).not.toHaveBeenCalled()
  })

  it('refuses to share a soft-deleted note', async () => {
    firestore.transactionGet.mockResolvedValueOnce(
      snapshot({ uid: 'owner-1', sharedWithUids: [], deletedAt: Timestamp.now() })
    )

    const result = await shareNote({ noteId: 'note-1', email: 'recipient@example.com' })

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.transactionUpdate).not.toHaveBeenCalled()
  })

  it('refuses to share a note with the owner', async () => {
    auth.getUserByEmail.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' })

    const result = await shareNote({ noteId: 'note-1', email: 'owner@example.com' })

    expect(result).toEqual({
      success: false,
      error: 'You cannot share a note with yourself',
    })
    expect(firestore.runTransaction).not.toHaveBeenCalled()
  })

  it('reports an email that has no account', async () => {
    auth.getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' })

    const result = await shareNote({ noteId: 'note-1', email: 'missing@example.com' })

    expect(result).toEqual({
      success: false,
      error: 'That email does not belong to a registered account',
    })
  })

  it('refuses to share twice with the same recipient', async () => {
    firestore.transactionGet.mockResolvedValueOnce(
      snapshot({ uid: 'owner-1', sharedWithUids: ['recipient-1'] })
    )

    const result = await shareNote({ noteId: 'note-1', email: 'recipient@example.com' })

    expect(result).toEqual({
      success: false,
      error: 'This note is already shared with that user',
    })
    expect(firestore.transactionUpdate).not.toHaveBeenCalled()
  })

  it('enforces the 50-person sharing cap', async () => {
    const sharedWithUids = Array.from({ length: 50 }, (_, index) => `user-${index}`)
    firestore.transactionGet.mockResolvedValueOnce(snapshot({ uid: 'owner-1', sharedWithUids }))

    const result = await shareNote({ noteId: 'note-1', email: 'recipient@example.com' })

    expect(result).toEqual({
      success: false,
      error: 'A note can be shared with up to 50 people',
    })
    expect(firestore.transactionUpdate).not.toHaveBeenCalled()
  })

  it('re-activates a previously revoked share', async () => {
    firestore.transactionGet
      .mockResolvedValueOnce(snapshot({ uid: 'owner-1', sharedWithUids: [] }))
      .mockResolvedValueOnce(
        snapshot({
          ownerUid: 'owner-1',
          revokedAt: Timestamp.fromMillis(100),
          createdAt: Timestamp.fromMillis(50),
        })
      )

    const result = await shareNote({ noteId: 'note-1', email: 'recipient@example.com' })

    expect(result.success).toBe(true)
    expect(firestore.transactionSet).toHaveBeenCalledWith(
      firestore.shareRef,
      expect.objectContaining({
        revokedAt: null,
        createdAt: Timestamp.fromMillis(50),
      })
    )
  })
})

describe('unshareNote', () => {
  it('removes the recipient and soft-revokes the share record', async () => {
    firestore.transactionGet
      .mockResolvedValueOnce(
        snapshot({ uid: 'owner-1', sharedWithUids: ['recipient-2', 'recipient-1'] })
      )
      .mockResolvedValueOnce(snapshot({ ownerUid: 'owner-1', revokedAt: null }))

    const result = await unshareNote({ noteId: 'note-1', recipientUid: 'recipient-1' })

    expect(result).toEqual({ success: true })
    expect(firestore.shareDocIds).toContain('note-1_recipient-1')
    expect(firestore.transactionUpdate).toHaveBeenNthCalledWith(1, firestore.noteRef, {
      sharedWithUids: ['recipient-2'],
    })
    expect(firestore.transactionUpdate).toHaveBeenNthCalledWith(2, firestore.shareRef, {
      revokedAt: expect.any(Timestamp),
      updatedAt: expect.any(Timestamp),
    })
  })

  it('refuses to revoke a share from a note the caller does not own', async () => {
    firestore.transactionGet.mockResolvedValueOnce(
      snapshot({ uid: 'someone-else', sharedWithUids: ['recipient-1'] })
    )

    const result = await unshareNote({ noteId: 'note-1', recipientUid: 'recipient-1' })

    expect(result).toEqual({ success: false, error: 'Note not found' })
    expect(firestore.transactionUpdate).not.toHaveBeenCalled()
  })

  it('reports a share that does not exist', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot({ uid: 'owner-1', sharedWithUids: [] }))

    const result = await unshareNote({ noteId: 'note-1', recipientUid: 'recipient-1' })

    expect(result).toEqual({ success: false, error: 'Share not found' })
    expect(firestore.transactionUpdate).not.toHaveBeenCalled()
  })

  it('rejects an invalid recipient id', async () => {
    const result = await unshareNote({ noteId: 'note-1', recipientUid: '' })

    expect(result.success).toBe(false)
    expect(firestore.runTransaction).not.toHaveBeenCalled()
  })
})
