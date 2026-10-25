'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { orderBy, where } from 'firebase/firestore'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAuth } from '@/hooks/useAuth'
import { useCollection } from '@/hooks/useFirestore'
import { getNoteCommentsCollection } from '@/lib/firebase/firestore'
import { formatDatetime } from '@/lib/utils'
import { addNoteComment } from '@/features/notes/actions/comments.actions'
import { MAX_COMMENT_LENGTH } from '@/features/notes/constants'

const commentFormSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(MAX_COMMENT_LENGTH, `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`),
})

type CommentFormInput = z.infer<typeof commentFormSchema>

const textareaClassName =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-500 focus:outline-none aria-invalid:border-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900'

const primaryButtonClassName =
  'rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200'

interface NoteCommentsProps {
  noteId: string
}

export function NoteComments({ noteId }: NoteCommentsProps) {
  const { user } = useAuth()
  const {
    data: comments,
    loading,
    error,
    retry,
  } = useCollection(
    getNoteCommentsCollection(),
    where('noteId', '==', noteId),
    orderBy('createdAt', 'asc')
  )

  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CommentFormInput>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: { body: '' },
  })

  const body = watch('body') ?? ''

  const onSubmit = async (data: CommentFormInput) => {
    setFormError(null)

    const result = await addNoteComment({ noteId, body: data.body })
    if (result.success) {
      toast.success('Comment added')
      reset()
    } else {
      setFormError(result.error ?? 'Failed to add comment')
      toast.error(result.error ?? 'Failed to add comment')
    }
  }

  return (
    <section className="space-y-3" aria-labelledby={`comments-heading-${noteId}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`comments-heading-${noteId}`} className="text-sm font-medium">
          Comments
        </h3>
        {!loading && !error && <span className="text-xs text-zinc-500">{comments.length}</span>}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-3 text-sm text-zinc-500">
          <LoadingSpinner size="sm" />
          <span>Loading comments…</span>
        </div>
      )}

      {!loading && error && (
        <ErrorState title="Couldn't load comments" description={error.message} onRetry={retry} />
      )}

      {!loading && !error && comments.length === 0 && (
        <p className="rounded-md border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No comments yet. Start the conversation.
        </p>
      )}

      {!loading && !error && comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((comment) => {
            const createdAt = comment.createdAt.toDate()
            const authorLabel =
              comment.authorUid === user?.uid
                ? 'You'
                : (comment.authorDisplayName ?? 'Unknown user')

            return (
              <li
                key={comment.id}
                className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium">{authorLabel}</p>
                  <time dateTime={createdAt.toISOString()} className="text-xs text-zinc-400">
                    {formatDatetime(createdAt)}
                  </time>
                </div>
                <p className="mt-1 text-sm break-words whitespace-pre-wrap">{comment.body}</p>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2" noValidate>
        <label htmlFor={`comment-body-${noteId}`} className="sr-only">
          Add a comment
        </label>
        <textarea
          id={`comment-body-${noteId}`}
          rows={3}
          maxLength={MAX_COMMENT_LENGTH}
          aria-invalid={!!errors.body}
          aria-describedby={errors.body ? `comment-body-error-${noteId}` : undefined}
          className={textareaClassName}
          placeholder="Add a comment…"
          disabled={isSubmitting}
          {...register('body')}
        />

        {errors.body && (
          <p id={`comment-body-error-${noteId}`} className="text-xs text-red-500" role="alert">
            {errors.body.message}
          </p>
        )}
        {formError && (
          <p className="text-xs text-red-500" role="alert">
            {formError}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-400">
            {body.length}/{MAX_COMMENT_LENGTH}
          </span>
          <button type="submit" disabled={isSubmitting} className={primaryButtonClassName}>
            {isSubmitting ? 'Posting…' : 'Add comment'}
          </button>
        </div>
      </form>
    </section>
  )
}
