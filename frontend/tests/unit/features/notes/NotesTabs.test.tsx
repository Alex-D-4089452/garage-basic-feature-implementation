import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotesTabs } from '@/features/notes/components/NotesTabs'

describe('NotesTabs', () => {
  it('shows the owner notes by default', () => {
    render(<NotesTabs myNotes={<p>My notes panel</p>} sharedNotes={<p>Shared notes panel</p>} />)

    expect(screen.getByRole('tab', { name: 'My notes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Shared with me' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
    expect(screen.getByText('My notes panel')).toBeVisible()
    expect(screen.getByText('Shared notes panel')).not.toBeVisible()
  })

  it('switches to notes shared with the current user', async () => {
    const user = userEvent.setup()
    render(<NotesTabs myNotes={<p>My notes panel</p>} sharedNotes={<p>Shared notes panel</p>} />)

    await user.click(screen.getByRole('tab', { name: 'Shared with me' }))

    expect(screen.getByRole('tab', { name: 'Shared with me' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByText('Shared notes panel')).toBeVisible()
    expect(screen.getByText('My notes panel')).not.toBeVisible()
  })
})
