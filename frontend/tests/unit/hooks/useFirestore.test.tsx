import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onSnapshot, type CollectionReference, type QueryConstraint } from 'firebase/firestore'
import { useCollection } from '@/hooks/useFirestore'
import type { Note } from '@/types/firestore'

vi.mock('firebase/firestore', () => ({
  query: vi.fn((collectionRef: unknown, ...constraints: unknown[]) => ({
    collectionRef,
    constraints,
  })),
  queryEqual: vi.fn(
    (a: { constraints: unknown[] }, b: { constraints: unknown[] }) =>
      JSON.stringify(a.constraints) === JSON.stringify(b.constraints)
  ),
  onSnapshot: vi.fn(),
}))

interface TestListener {
  onNext: (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void
  onError: (error: Error) => void
  unsubscribe: ReturnType<typeof vi.fn>
}

const listeners: TestListener[] = []
const collectionRef = { path: 'notes' } as unknown as CollectionReference<Note>

function useTestCollection(uid: string) {
  return useCollection(collectionRef, { field: 'uid', value: uid } as unknown as QueryConstraint)
}

beforeEach(() => {
  listeners.length = 0
  vi.mocked(onSnapshot).mockReset()
  vi.mocked(onSnapshot).mockImplementation(((_q: unknown, onNext: unknown, onError: unknown) => {
    const unsubscribe = vi.fn()
    listeners.push({
      onNext: onNext as TestListener['onNext'],
      onError: onError as TestListener['onError'],
      unsubscribe,
    })
    return unsubscribe
  }) as never)
})

describe('useCollection', () => {
  it('keeps one live listener across re-renders with the same query', () => {
    const { rerender } = renderHook(({ uid }) => useTestCollection(uid), {
      initialProps: { uid: 'user-1' },
    })

    expect(onSnapshot).toHaveBeenCalledTimes(1)

    rerender({ uid: 'user-1' })
    rerender({ uid: 'user-1' })

    expect(onSnapshot).toHaveBeenCalledTimes(1)
  })

  it('resubscribes when the query changes', () => {
    const { rerender } = renderHook(({ uid }) => useTestCollection(uid), {
      initialProps: { uid: 'user-1' },
    })

    rerender({ uid: 'user-2' })

    expect(onSnapshot).toHaveBeenCalledTimes(2)
    expect(listeners[0]!.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('renders snapshot data without a refresh', () => {
    const { result } = renderHook(({ uid }) => useTestCollection(uid), {
      initialProps: { uid: 'user-1' },
    })

    act(() => {
      listeners[0]!.onNext({
        docs: [{ id: 'note-1', data: () => ({ title: 'Fresh note' }) }],
      })
    })

    expect(result.current.data).toEqual([{ id: 'note-1', title: 'Fresh note' }])
    expect(result.current.loading).toBe(false)
  })

  it('exposes snapshot errors', () => {
    const { result } = renderHook(({ uid }) => useTestCollection(uid), {
      initialProps: { uid: 'user-1' },
    })

    act(() => {
      listeners[0]!.onError(new Error('permission-denied'))
    })

    expect(result.current.error?.message).toBe('permission-denied')
    expect(result.current.loading).toBe(false)
  })
})
