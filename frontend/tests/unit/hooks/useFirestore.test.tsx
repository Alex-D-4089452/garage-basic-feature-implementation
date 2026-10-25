import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollection } from '@/hooks/useFirestore'

// Mock the entire firebase/firestore module
vi.mock('firebase/firestore', () => {
  let mockSnapshotCallback: ((snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) | null = null
  let mockErrorCallback: ((error: Error) => void) | null = null

  return {
    query: vi.fn((collectionRef, ...constraints) => ({
      __collectionRef: collectionRef,
      __constraints: constraints,
    })),
    queryEqual: vi.fn((q1: { __collectionRef: unknown; __constraints: unknown[] }, q2: { __collectionRef: unknown; __constraints: unknown[] }) =>
      q1.__collectionRef === q2.__collectionRef &&
      q1.__constraints.length === q2.__constraints.length &&
      q1.__constraints.every((c, i) => c === q2.__constraints[i])
    ),
    onSnapshot: vi.fn((_query, onNext, onError) => {
      mockSnapshotCallback = onNext
      mockErrorCallback = onError
      return vi.fn() // unsubscribe function
    }),
    where: vi.fn((field: string, op: string, value: unknown) => ({ __where: [field, op, value] })),
    // Test helpers
    __testHelpers: {
      triggerSnapshot: (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => {
        mockSnapshotCallback?.({ docs })
      },
      triggerError: (error: Error) => {
        mockErrorCallback?.(error)
      },
      reset: () => {
        mockSnapshotCallback = null
        mockErrorCallback = null
      },
    },
  }
})

// Import the mocked module to access test helpers
import * as firestoreMock from 'firebase/firestore'

const { __testHelpers: testHelpers } = firestoreMock as unknown as {
  __testHelpers: {
    triggerSnapshot: (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => void
    triggerError: (error: Error) => void
    reset: () => void
  }
}

// A simple mock collection reference
const mockCollectionRef = { 
  path: 'notes', 
  id: 'notes',
  type: 'collection',
  parent: null,
  withConverter: () => mockCollectionRef,
  converter: null,
  firestore: null,
} as any

beforeEach(() => {
  testHelpers.reset()
  vi.clearAllMocks()
})

describe('useCollection', () => {
  it('keeps one live listener across re-renders with the same query', () => {
    const { result, rerender } = renderHook(() => useCollection(mockCollectionRef))
    expect(result.current.data).toEqual([])
    expect(result.current.loading).toBe(true)

    // Trigger initial snapshot to transition out of loading
    act(() => {
      testHelpers.triggerSnapshot([])
    })

    expect(result.current.data).toEqual([])
    expect(result.current.loading).toBe(false)

    rerender()
    expect(result.current.data).toEqual([])
    expect(result.current.loading).toBe(false)
    // onSnapshot should only be called once (queryEqual prevents re-subscription)
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(1)
  })

  it('resubscribes when the query changes', () => {
    const constraint1 = { type: 'where', field: 'uid', op: '==', value: 'user-1' } as any
    const constraint2 = { type: 'where', field: 'uid', op: '==', value: 'user-2' } as any
    const { result, rerender } = renderHook(
      ({ constraint }) => useCollection(mockCollectionRef, constraint),
      { initialProps: { constraint: constraint1 } }
    )
    expect(result.current.data).toEqual([])

    rerender({ constraint: constraint2 })
    expect(result.current.data).toEqual([])
    // query should be called twice (initial + after query change)
    expect(firestoreMock.query).toHaveBeenCalledTimes(2)
  })

  it('renders snapshot data without a refresh', () => {
    const { result } = renderHook(() => useCollection(mockCollectionRef))
    expect(result.current.data).toEqual([])

    // Simulate a snapshot
    act(() => {
      testHelpers.triggerSnapshot([
        { id: 'doc1', data: () => ({ title: 'Test' }) },
      ])
    })

    expect(result.current.data).toEqual([{ id: 'doc1', title: 'Test' }])
    expect(result.current.loading).toBe(false)
  })

  it('exposes snapshot errors', () => {
    const { result } = renderHook(() => useCollection(mockCollectionRef))
    expect(result.current.error).toBeNull()

    // Simulate an error
    act(() => {
      testHelpers.triggerError(new Error('permission-denied'))
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('permission-denied')
    expect(result.current.loading).toBe(false)
  })

  it('replaces the listener when retry is called', () => {
    const { result, rerender } = renderHook(() => useCollection(mockCollectionRef))
    expect(result.current.data).toEqual([])

    // Initial subscription
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(1)

    // Rerender with same query - should not create new listener
    rerender()
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(1)

    // Call retry - should create new listener
    act(() => {
      result.current.retry()
    })

    // Should have created a new listener
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(2)
  })
})