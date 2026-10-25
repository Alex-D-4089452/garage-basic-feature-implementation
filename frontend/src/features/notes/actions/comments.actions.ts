'use server'

import { z } from 'zod'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { requireAuth } from '@/actions/auth.actions'
import { MAX_COMMENT_LENGTH } from '@/features/notes/constants'
import { getUserDisplayName } from '@/features/notes/server/userDisplayName'
import type { ActionResult } from '@/types'

const addNoteCommentSchema = z.object({
  noteId: z.string().min(1).max(128),
  body: z
    .string()
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(MAX_COMMENT_LENGTH, `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`),
})

function readSharedWithUids(data: Record<string, unknown> | undefined): string[] {
  if (!Array.isArray(data?.sharedWithUids)) return []
  return data.sharedWithUids.filter((uid): uid is string => typeof uid === 'string')
}

/**
 * Add a comment to a note the signed-in user owns or is an active recipient of.
 *
 * Comments are written with the Admin SDK so clients cannot forge the author
 * or bypass the participant check. The note and (for recipients) the active
 * share are read in the same transaction as the write.
 */
export async function addNoteComment(input: unknown): Promise<ActionResult<string>> {
  const session = await requireAuth()

  const parsed = addNoteCommentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { noteId, body } = parsed.data
  const noteRef = adminDb.collection('notes').doc(noteId)
  const shareRef = adminDb.collection('noteShares').doc(`${noteId}_${session.uid}`)
  const authorDisplayName = await getUserDisplayName(session.uid, session)

  try {
    return await adminDb.runTransaction<ActionResult<string>>(async (transaction) => {
      const noteSnap = await transaction.get(noteRef)
      if (!noteSnap.exists) {
        return { success: false, error: 'Note not found' }
      }

      const note = noteSnap.data()
      if (!note || note.deletedAt != null) {
        return { success: false, error: 'Note not found' }
      }

      const isOwner = note.uid === session.uid
      if (!isOwner) {
        const sharedWithUids = readSharedWithUids(note)
        if (!sharedWithUids.includes(session.uid)) {
          return { success: false, error: 'Note not found' }
        }

        const shareSnap = await transaction.get(shareRef)
        if (!shareSnap.exists) {
          return { success: false, error: 'Share not found' }
        }

        const share = shareSnap.data()
        if (
          !share ||
          share.ownerUid !== note.uid ||
          share.recipientUid !== session.uid ||
          share.revokedAt != null
        ) {
          return { success: false, error: 'Share not found' }
        }
      }

      const now = Timestamp.now()
      const commentRef = adminDb.collection('noteComments').doc()
      transaction.set(commentRef, {
        noteId,
        authorUid: session.uid,
        authorDisplayName,
        body,
        createdAt: now,
        updatedAt: now,
        _schemaVersion: 1,
      })

      return { success: true, data: commentRef.id }
    })
  } catch {
    return { success: false, error: 'Failed to add comment' }
  }
}
