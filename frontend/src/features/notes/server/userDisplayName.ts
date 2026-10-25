import { adminDb } from '@/lib/firebase/admin'

/**
 * Resolve a user's display name for denormalized records such as shares and
 * comments. Falls back to the Auth session when the profile is unavailable so
 * the write is never blocked by a missing `users/{uid}` document.
 */
export async function getUserDisplayName(
  uid: string,
  session: { name?: string; email?: string }
): Promise<string | null> {
  try {
    const snap = await adminDb.collection('users').doc(uid).get()
    const displayName = snap.data()?.displayName
    if (typeof displayName === 'string' && displayName.trim()) {
      return displayName.trim()
    }
  } catch {
    // A missing profile must not block the write — fall back to the auth token.
  }

  return session.name?.trim() || session.email || null
}
