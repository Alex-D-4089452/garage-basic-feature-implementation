# Firestore Schema

## Overview

All collections use the typed collection pattern — see `frontend/src/lib/firebase/firestore.ts`.
Security rules are in `firebase/firestore.rules`.

## Schema versioning

Every document in every collection **must** include a `_schemaVersion` field:

\`\`\`typescript
_schemaVersion: 1 // increment when doing a breaking schema change
\`\`\`

This enables **lazy migration** — when a document is read, check `_schemaVersion` and migrate on the fly if it's behind current.

**Rules:**

- `_schemaVersion` is always `1` on creation
- Non-breaking changes (adding optional fields with defaults) keep the same version
- Breaking changes (rename, remove, type change) increment the version and require a migration function
- Never remove `_schemaVersion` from a schema

---

## `users` collection

**Path:** `/users/{userId}`
**Access:** Owner-only (user can read/write their own document; admins can read all)

| Field            | Type                | Required | Description                                  |
| ---------------- | ------------------- | -------- | -------------------------------------------- |
| `uid`            | `string`            | Yes      | Firebase Auth UID (same as document ID)      |
| `email`          | `string`            | Yes      | User's email address                         |
| `displayName`    | `string \| null`    | Yes      | Display name from Auth or profile            |
| `photoURL`       | `string \| null`    | Yes      | Profile photo URL                            |
| `role`           | `'user' \| 'admin'` | Yes      | User role — immutable by user after creation |
| `createdAt`      | `Timestamp`         | Yes      | When the document was created                |
| `updatedAt`      | `Timestamp`         | Yes      | When the document was last updated           |
| `_schemaVersion` | `1`                 | Yes      | Schema version for lazy migration            |

**Creation:** Auto-created by `AuthProvider` on first sign-in via `syncUserProfile()`.
**Deletion:** Hard-delete is disabled in security rules. Use `deletedAt` field for soft-delete.

---

## `notes` collection

**Path:** `/notes/{noteId}`
**Access:** Owner-only (owner can read/write; shared users can read via `sharedWithUids`)

| Field            | Type                | Required | Description                                                                            |
| ---------------- | ------------------- | -------- | -------------------------------------------------------------------------------------- |
| `uid`            | `string`            | Yes      | Owner's Firebase Auth UID                                                              |
| `title`          | `string`            | Yes      | Note title (1–200 chars)                                                               |
| `body`           | `string`            | Yes      | Note body (≤10 000 chars)                                                              |
| `createdAt`      | `Timestamp`         | Yes      | Creation time                                                                          |
| `updatedAt`      | `Timestamp`         | Yes      | Last update time                                                                       |
| `sharedWithUids` | `string[]`          | No       | UIDs of users this note is shared with (view-only). Used for `array-contains` queries. |
| `deletedAt`      | `Timestamp \| null` | No       | Soft-delete marker — absent/null means active                                          |
| `_schemaVersion` | `1`                 | Yes      | Schema version for lazy migration                                                      |

**Deletion:** Hard-delete is disabled in security rules. `deleteNote` sets `deletedAt`, clears `sharedWithUids`, and revokes all active `noteShares` in the same operation. `NotesList` filters soft-deleted notes out of the live query.

---

## `noteShares` collection

**Path:** `/noteShares/{noteId}_{recipientUid}`
**Access:** Owner and recipient can read; write denied for clients (Admin SDK only via Server Actions)

| Field              | Type                | Required | Description                                         |
| ------------------ | ------------------- | -------- | --------------------------------------------------- |
| `noteId`           | `string`            | Yes      | Reference to the shared note                        |
| `ownerUid`         | `string`            | Yes      | Note owner's UID                                    |
| `recipientUid`     | `string`            | Yes      | Recipient's UID (resolved via Firebase Auth)        |
| `recipientEmail`   | `string`            | Yes      | Recipient's email at time of share                  |
| `ownerDisplayName` | `string \| null`    | Yes      | Owner's display name for recipient UI               |
| `createdAt`        | `Timestamp`         | Yes      | When the share was created                          |
| `updatedAt`        | `Timestamp`         | Yes      | When the share was last updated                     |
| `revokedAt`        | `Timestamp \| null` | No       | Soft-revoke marker — absent/null means active share |
| `_schemaVersion`   | `1`                 | Yes      | Schema version for lazy migration                   |

**Document ID:** Deterministic `${noteId}_${recipientUid}` to prevent duplicates and allow direct lookup.

**Revocation:** `unshareNote` sets `revokedAt` (soft-revoke). Hard-delete is disabled. The owner's collaborator list and recipient's "Shared with me" list filter out revoked shares client-side.

**Creation:** Upserted by `shareNote` Server Action in the same transaction that adds the recipient to `notes.sharedWithUids`.

**Deletion:** Never hard-deleted. Soft-revoked via `revokedAt`. Owner soft-deleting a note revokes all its active shares.

---

<!-- Add new collection schemas below -->
