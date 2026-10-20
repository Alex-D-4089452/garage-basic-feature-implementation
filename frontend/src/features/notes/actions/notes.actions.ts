'use server'

import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { requireAuth } from '@/actions/auth.actions'
import { Timestamp } from 'firebase-admin/firestore'
import type { ActionResult } from '@/types'

const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000),
})

const updateNoteSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  body: z.string().max(10_000),
})

const noteIdSchema = z.string().min(1).max(128)

/**
 * Look up a note by id and verify the caller owns it and it is not soft-deleted.
 * Server Actions use the Admin SDK, which bypasses Firestore security rules, so
 * ownership must be checked here before any write.
 */
async function getActiveOwnedNote(noteId: string, uid: string) {
  const ref = adminDb.collection('notes').doc(noteId)
  const snap = await ref.get()

  if (!snap.exists) return null

  const data = snap.data()
  if (!data || data.uid !== uid || data.deletedAt != null) return null

  return ref
}

export async function createNote(input: unknown): Promise<ActionResult<string>> {
  const session = await requireAuth()

  const parsed = createNoteSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }
  }

  try {
    const now = Timestamp.now()
    const ref = await adminDb.collection('notes').add({
      ...parsed.data,
      uid: session.uid,
      createdAt: now,
      updatedAt: now,
      _schemaVersion: 1,
    })
    return { success: true, data: ref.id }
  } catch {
    return { success: false, error: 'Failed to create note' }
  }
}

export async function updateNote(input: unknown): Promise<ActionResult> {
  const session = await requireAuth()

  const parsed = updateNoteSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }
  }

  try {
    const { id, title, body } = parsed.data
    const ref = await getActiveOwnedNote(id, session.uid)
    if (!ref) {
      return { success: false, error: 'Note not found' }
    }

    await ref.update({ title, body, updatedAt: Timestamp.now() })
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update note' }
  }
}

export async function deleteNote(noteId: unknown): Promise<ActionResult> {
  const session = await requireAuth()

  const parsed = noteIdSchema.safeParse(noteId)
  if (!parsed.success) {
    return { success: false, error: 'Invalid note id' }
  }

  try {
    const ref = await getActiveOwnedNote(parsed.data, session.uid)
    if (!ref) {
      return { success: false, error: 'Note not found' }
    }

    // Soft delete: security rules forbid hard deletes. The UI filters notes
    // with a non-null `deletedAt` out of the list.
    const now = Timestamp.now()
    await ref.update({ deletedAt: now, updatedAt: now })
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to delete note' }
  }
}
