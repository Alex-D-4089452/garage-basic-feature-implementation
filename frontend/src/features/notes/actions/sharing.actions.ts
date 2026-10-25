'use server'

import { z } from 'zod'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { requireAuth } from '@/actions/auth.actions'
import { Timestamp } from 'firebase-admin/firestore'
import type { ActionResult } from '@/types'
import { MAX_SHARED_USERS } from '@/features/notes/constants'

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

async function getOwnerDisplayName(uid: string, session: { name?: string; email?: string }) {
  try {
    const snap = await adminDb.collection('users').doc(uid).get()
    const displayName = snap.data()?.displayName
    if (typeof displayName === 'string' && displayName.trim()) {
      return displayName.trim()
    }
  } catch {
    // A missing profile must not block sharing — fall back to the auth token.
  }

  return session.name?.trim() || session.email || null
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
    return { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }
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
  const ownerDisplayName = await getOwnerDisplayName(session.uid, session)

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
    return { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }
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
