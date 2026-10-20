'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { deleteNote, updateNote } from '@/features/notes/actions/notes.actions'
import type { Note } from '@/types/firestore'

const editNoteFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  body: z.string().max(10_000),
})

type EditNoteFormInput = z.infer<typeof editNoteFormSchema>

const inputClassName =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-500 focus:outline-none aria-invalid:border-red-500 dark:border-zinc-700 dark:bg-zinc-900'

const primaryButtonClassName =
  'rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200'

const secondaryButtonClassName =
  'rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800'

const dangerButtonClassName =
  'rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50'

export function NoteItem({ note }: { note: Note }) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditNoteFormInput>({
    resolver: zodResolver(editNoteFormSchema),
    defaultValues: { title: note.title, body: note.body },
  })

  const startEditing = () => {
    reset({ title: note.title, body: note.body })
    setEditing(true)
  }

  const onSubmit = async (data: EditNoteFormInput) => {
    const result = await updateNote({ id: note.id, ...data })
    if (result.success) {
      toast.success('Note updated')
      setEditing(false)
    } else {
      toast.error(result.error ?? 'Failed to update note')
    }
  }

  const onDelete = async () => {
    setDeleting(true)
    const result = await deleteNote(note.id)
    setDeleting(false)
    setConfirmingDelete(false)

    if (result.success) {
      toast.success('Note deleted')
    } else {
      toast.error(result.error ?? 'Failed to delete note')
    }
  }

  if (editing) {
    return (
      <li className="rounded-lg border p-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={`note-title-${note.id}`} className="text-sm font-medium">
              Title
            </label>
            <input
              id={`note-title-${note.id}`}
              type="text"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? `note-title-error-${note.id}` : undefined}
              className={inputClassName}
              placeholder="Note title"
              {...register('title')}
            />
            {errors.title && (
              <p id={`note-title-error-${note.id}`} className="text-xs text-red-500" role="alert">
                {errors.title.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`note-body-${note.id}`} className="text-sm font-medium">
              Body
            </label>
            <textarea
              id={`note-body-${note.id}`}
              rows={3}
              className={inputClassName}
              placeholder="Write something..."
              {...register('body')}
            />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={isSubmitting} className={primaryButtonClassName}>
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={isSubmitting}
              className={secondaryButtonClassName}
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-medium break-words">{note.title}</h3>
          {note.body && (
            <p className="text-sm break-words whitespace-pre-wrap text-zinc-500">{note.body}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={startEditing}
            aria-label={`Edit ${note.title}`}
            className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${note.title}`}
            className="text-sm font-medium text-red-600 transition-colors hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
          <span className="text-sm">Delete this note?</span>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className={dangerButtonClassName}
          >
            {deleting ? 'Deleting…' : 'Yes, delete'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
            className={secondaryButtonClassName}
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  )
}
