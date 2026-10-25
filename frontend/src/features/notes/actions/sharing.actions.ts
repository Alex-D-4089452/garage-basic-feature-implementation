'use server'

import { z } from 'zod'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { requireAuth } from '@/actions/auth.actions'
import { Timestamp } from 'firebase-admin/firestore'
import type { ActionResult } from '@/types'
import { MAX_SHARED_USERS } from '@/features/notes/constants'
import { getUserDisplayName } from '@/features/notes/server/userDisplayName'

const shareNoteSchema = z.object({
  noteId: z.string().min(1).max(128),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .max(254, 'Email is too long')
    .email('Enter a valid email address'),
})

const unshareNoteSchema = z.object({
  noteId: z.string().min(1).max(128),
  recipientUid: z.string().min(1).max(128),
})

const setNoteReviewedSchema = z.object({
  noteId: z.string().min(1).max(128),
  reviewed: z.boolean(),
})

function isUserNotFoundError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'auth/user-not-found'
  )
}

function readSharedWithUids(data: Record<string, unknown> | undefined): string[] {
  if (!Array.isArray(data?.sharedWithUids)) return []
  return data.sharedWithUids.filter((uid): uid is string => typeof uid === 'string')
}

/**
 * Share a note with an existing account (view-only).
 *
 * The recipient is resolved by email through Firebase Auth. The note access
 * list and the audit record are written in one transaction so the owner's
 * collaborator list and the recipient's live query stay consistent.
 */
export async function shareNote(
  input: unknown
): Promise<ActionResult<{ recipientUid: string; recipientEmail: string }>> {
  const session = await requireAuth()

  const parsed = shareNoteSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { noteId, email } = parsed.data

  let recipient
  try {
    recipient = await adminAuth.getUserByEmail(email)
  } catch (error) {
    if (isUserNotFoundError(error)) {
      return { success: false, error: 'That email does not belong to a registered account' }
    }
    return { success: false, error: 'Failed to share note' }
  }

  if (recipient.uid === session.uid) {
    return { success: false, error: 'You cannot share a note with yourself' }
  }

  const recipientEmail = (recipient.email ?? email).toLowerCase()
  const ownerDisplayName = await getUserDisplayName(session.uid, session)

  const noteRef = adminDb.collection('notes').doc(noteId)
  const shareRef = adminDb.collection('noteShares').doc(`${noteId}_${recipient.uid}`)

  try {
    return await adminDb.runTransaction<
      ActionResult<{ recipientUid: string; recipientEmail: string }>
    >(async (transaction) => {
      const noteSnap = await transaction.get(noteRef)
      if (!noteSnap.exists) {
        return { success: false, error: 'Note not found' }
      }

      const note = noteSnap.data()
      if (!note || note.uid !== session.uid || note.deletedAt != null) {
        return { success: false, error: 'Note not found' }
      }

      const sharedWithUids = readSharedWithUids(note)
      if (sharedWithUids.includes(recipient.uid)) {
        return { success: false, error: 'This note is already shared with that user' }
      }
      if (sharedWithUids.length >= MAX_SHARED_USERS) {
        return {
          success: false,
          error: `A note can be shared with up to ${MAX_SHARED_USERS} people`,
        }
      }

      const shareSnap = await transaction.get(shareRef)
      const existingShare = shareSnap.exists ? shareSnap.data() : undefined
      if (existingShare && existingShare.revokedAt == null) {
        return { success: false, error: 'This note is already shared with that user' }
      }

      const now = Timestamp.now()
      transaction.update(noteRef, {
        sharedWithUids: [...sharedWithUids, recipient.uid],
      })
      transaction.set(shareRef, {
        noteId,
        ownerUid: session.uid,
        recipientUid: recipient.uid,
        recipientEmail,
        ownerDisplayName,
        createdAt: existingShare?.createdAt ?? now,
        updatedAt: now,
        revokedAt: null,
        // Re-sharing a previously revoked note starts the review state fresh.
        reviewedAt: null,
        _schemaVersion: 1,
      })

      return {
        success: true,
        data: { recipientUid: recipient.uid, recipientEmail },
      }
    })
  } catch {
    return { success: false, error: 'Failed to share note' }
  }
}

/**
 * Revoke a recipient's access to a note (view-only sharing).
 *
 * Revocation is soft: the share record is kept and marked with `revokedAt`,
 * while the recipient is removed from the note's access list.
 */
export async function unshareNote(input: unknown): Promise<ActionResult> {
  const session = await requireAuth()

  const parsed = unshareNoteSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { noteId, recipientUid } = parsed.data
  const noteRef = adminDb.collection('notes').doc(noteId)
  const shareRef = adminDb.collection('noteShares').doc(`${noteId}_${recipientUid}`)

  try {
    return await adminDb.runTransaction<ActionResult>(async (transaction) => {
      const noteSnap = await transaction.get(noteRef)
      if (!noteSnap.exists) {
        return { success: false, error: 'Note not found' }
      }

      const note = noteSnap.data()
      if (!note || note.uid !== session.uid || note.deletedAt != null) {
        return { success: false, error: 'Note not found' }
      }

      const sharedWithUids = readSharedWithUids(note)
      if (!sharedWithUids.includes(recipientUid)) {
        return { success: false, error: 'Share not found' }
      }

      const shareSnap = await transaction.get(shareRef)
      const now = Timestamp.now()

      transaction.update(noteRef, {
        sharedWithUids: sharedWithUids.filter((uid) => uid !== recipientUid),
      })
      if (shareSnap.exists) {
        transaction.update(shareRef, { revokedAt: now, updatedAt: now })
      }

      return { success: true }
    })
  } catch {
    return { success: false, error: 'Failed to revoke share' }
  }
}

/**
 * Mark a shared note as reviewed (or clear the review) for the signed-in
 * recipient. The note's access list and the share record are both checked so a
 * revoked recipient cannot write review state.
 */
export async function setNoteReviewed(input: unknown): Promise<ActionResult> {
  const session = await requireAuth()

  const parsed = setNoteReviewedSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { noteId, reviewed } = parsed.data
  const noteRef = adminDb.collection('notes').doc(noteId)
  const shareRef = adminDb.collection('noteShares').doc(`${noteId}_${session.uid}`)

  try {
    return await adminDb.runTransaction<ActionResult>(async (transaction) => {
      const noteSnap = await transaction.get(noteRef)
      if (!noteSnap.exists) {
        return { success: false, error: 'Note not found' }
      }

      const note = noteSnap.data()
      const sharedWithUids = readSharedWithUids(note)
      if (
        !note ||
        note.deletedAt != null ||
        note.uid === session.uid ||
        !sharedWithUids.includes(session.uid)
      ) {
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

      const now = Timestamp.now()
      transaction.update(shareRef, {
        reviewedAt: reviewed ? now : null,
        updatedAt: now,
      })

      return { success: true }
    })
  } catch {
    return { success: false, error: 'Failed to update review status' }
  }
}
