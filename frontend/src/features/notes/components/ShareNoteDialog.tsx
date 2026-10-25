'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { where } from 'firebase/firestore'
import { toast } from 'sonner'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAuth } from '@/hooks/useAuth'
import { useCollection } from '@/hooks/useFirestore'
import { getNoteSharesCollection } from '@/lib/firebase/firestore'
import { formatDatetime } from '@/lib/utils'
import { shareNote, unshareNote } from '@/features/notes/actions/sharing.actions'
import { MAX_SHARED_USERS } from '@/features/notes/constants'
import type { Note } from '@/types/firestore'

const shareFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .max(254, 'Email is too long')
    .email('Enter a valid email address'),
})

type ShareFormInput = z.infer<typeof shareFormSchema>

const inputClassName =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-500 focus:outline-none aria-invalid:border-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900'

const primaryButtonClassName =
  'rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200'

interface ShareNoteDialogProps {
  note: Note
  open: boolean
  onClose: () => void
}

export function ShareNoteDialog({ note, open, onClose }: ShareNoteDialogProps) {
  const { user } = useAuth()
  const {
    data: shares,
    loading,
    error,
    retry,
  } = useCollection(
    getNoteSharesCollection(),
    where('ownerUid', '==', user?.uid ?? ''),
    where('noteId', '==', note.id),
    where('revokedAt', '==', null)
  )

  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [revokingUid, setRevokingUid] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ShareFormInput>({
    resolver: zodResolver(shareFormSchema),
    defaultValues: { email: '' },
  })

  const atLimit = shares.length >= MAX_SHARED_USERS
  // The collaborator count drives the cap and duplicate feedback, so keep the
  // form disabled until the live list has loaded.
  const formDisabled = isSubmitting || loading || atLimit

  const onSubmit = async (data: ShareFormInput) => {
    setFormError(null)
    if (formDisabled) return

    const result = await shareNote({ noteId: note.id, email: data.email })
    if (result.success) {
      toast.success(`Shared with ${result.data?.recipientEmail ?? data.email}`)
      reset()
    } else {
      setFormError(result.error ?? 'Failed to share note')
      toast.error(result.error ?? 'Failed to share note')
    }
  }

  const onRevoke = async (recipientUid: string, recipientEmail: string) => {
    setListError(null)
    setRevokingUid(recipientUid)

    const result = await unshareNote({ noteId: note.id, recipientUid })
    setRevokingUid(null)

    if (result.success) {
      toast.success(`Removed access for ${recipientEmail}`)
    } else {
      setListError(result.error ?? 'Failed to revoke share')
      toast.error(result.error ?? 'Failed to revoke share')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share note"
      description={`“${note.title}” is shared as view-only. The other person needs an existing account.`}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <label htmlFor={`share-email-${note.id}`} className="text-sm font-medium">
            Recipient email
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`share-email-${note.id}`}
              type="email"
              autoComplete="email"
              autoFocus
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? `share-email-error-${note.id}` : undefined}
              aria-label="Recipient email"
              className={inputClassName}
              placeholder="teammate@example.com"
              disabled={formDisabled}
              {...register('email')}
            />
            <button
              type="submit"
              disabled={formDisabled}
              className={`${primaryButtonClassName} shrink-0`}
            >
              {isSubmitting ? 'Sharing…' : 'Share'}
            </button>
          </div>

          {errors.email && (
            <p id={`share-email-error-${note.id}`} className="text-xs text-red-500" role="alert">
              {errors.email.message}
            </p>
          )}
          {formError && (
            <p className="text-xs text-red-500" role="alert">
              {formError}
            </p>
          )}
          {atLimit && (
            <p className="text-xs text-zinc-500" role="status">
              This note has reached the {MAX_SHARED_USERS}-person sharing limit.
            </p>
          )}
        </div>
      </form>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">People with access</h3>
          {!loading && !error && (
            <span className="text-xs text-zinc-500">
              {shares.length} of {MAX_SHARED_USERS}
            </span>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
            <LoadingSpinner size="sm" />
            <span>Loading collaborators…</span>
          </div>
        )}

        {!loading && error && (
          <ErrorState
            title="Couldn't load collaborators"
            description={error.message}
            onRetry={retry}
          />
        )}

        {!loading && !error && shares.length === 0 && (
          <p className="py-4 text-sm text-zinc-500">
            Not shared with anyone yet. Add an email above to give someone view-only access.
          </p>
        )}

        {!loading && !error && shares.length > 0 && (
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {shares.map((share) => (
              <li
                key={share.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{share.recipientEmail}</p>
                  <p className="text-xs text-zinc-500">View only</p>
                  <p className="text-xs text-zinc-500">
                    {share.reviewedAt
                      ? `Reviewed ${formatDatetime(share.reviewedAt.toDate())}`
                      : 'Not reviewed yet'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRevoke(share.recipientUid, share.recipientEmail)}
                  disabled={revokingUid === share.recipientUid}
                  aria-label={`Remove ${share.recipientEmail}`}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {revokingUid === share.recipientUid ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {listError && (
          <p className="text-xs text-red-500" role="alert">
            {listError}
          </p>
        )}
      </div>
    </Modal>
  )
}
