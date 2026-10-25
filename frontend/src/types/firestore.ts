import type { Timestamp } from 'firebase/firestore'

/**
 * Firestore collection type definitions.
 *
 * Keep in sync with:
 *   - src/lib/firebase/firestore.ts  (typed collection exports)
 *   - firebase/firestore.rules       (security rules)
 *   - docs/FIRESTORE-SCHEMA.md       (schema documentation)
 */

export interface UserProfile {
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
  role: 'user'
  createdAt: Timestamp
  updatedAt: Timestamp
  _schemaVersion: 1
}

export type CreateUserProfileInput = Omit<UserProfile, 'createdAt' | 'updatedAt'>

export interface Note {
  id: string
  uid: string // owner's user id — used by security rules
  title: string
  body: string
  createdAt: Timestamp
  updatedAt: Timestamp
  /** UIDs of users this note is shared with (view-only). Used for array-contains queries. */
  sharedWithUids?: string[]
  /** Set when the note is soft-deleted. Absent or null means active. */
  deletedAt?: Timestamp | null
  _schemaVersion: 1
}

export interface NoteShare {
  id: string // deterministic: `${noteId}_${recipientUid}`
  noteId: string
  ownerUid: string
  recipientUid: string
  recipientEmail: string
  ownerDisplayName: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
  /** Set when share is revoked. Absent or null means active. */
  revokedAt?: Timestamp | null
  /** Set when the recipient marks the note as reviewed. Absent or null means not reviewed. */
  reviewedAt?: Timestamp | null
  _schemaVersion: 1
}

export type CreateNoteShareInput = Omit<
  NoteShare,
  'id' | 'createdAt' | 'updatedAt' | 'revokedAt' | 'reviewedAt'
>

export interface NoteComment {
  id: string
  noteId: string
  authorUid: string
  /** Snapshot of the author's display name at comment time. */
  authorDisplayName: string | null
  body: string
  createdAt: Timestamp
  updatedAt: Timestamp
  _schemaVersion: 1
}
