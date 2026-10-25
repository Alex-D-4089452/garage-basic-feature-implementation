'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  onSnapshot,
  query,
  queryEqual,
  type CollectionReference,
  type DocumentData,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore'

interface UseCollectionResult<T> {
  data: T[]
  loading: boolean
  error: Error | null
  /** Tears down the current listener and starts a fresh subscription. */
  retry: () => void
}

/**
 * Subscribe to a Firestore collection with real-time updates.
 *
 * Collection references are typically recreated on every render (e.g.
 * `getNotesCollection()`), but only the query itself matters. Re-subscribing
 * whenever a render creates a new reference tears the listener down before
 * server updates arrive, so the live subscription is kept and only replaced
 * when the query actually changes.
 *
 * @example
 * const { data, loading, error } = useCollection(usersCollection, where('role', '==', 'admin'))
 */
export function useCollection<T extends DocumentData>(
  collectionRef: CollectionReference<T>,
  ...queryConstraints: QueryConstraint[]
): UseCollectionResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  const activeQuery = useRef<Query<T> | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)
  const lastRetryToken = useRef(retryToken)

  // Intentionally no dependency array: the effect runs after every render so it
  // can detect a changed query, but a structurally identical query is a no-op.
  // A retry keeps the same query and forces a fresh listener instead.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const nextQuery =
      queryConstraints.length > 0 ? query(collectionRef, ...queryConstraints) : query(collectionRef)

    if (
      activeQuery.current &&
      queryEqual(activeQuery.current, nextQuery) &&
      lastRetryToken.current === retryToken
    ) {
      return
    }

    unsubscribe.current?.()
    activeQuery.current = nextQuery
    lastRetryToken.current = retryToken
    setLoading(true)
    setError(null)

    unsubscribe.current = onSnapshot(
      nextQuery,
      (snapshot) => {
        setData(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[])
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )
  })

  // Tear down the active listener when the component unmounts.
  useEffect(() => {
    return () => {
      unsubscribe.current?.()
      unsubscribe.current = null
      activeQuery.current = null
    }
  }, [])

  const retry = useCallback(() => {
    setRetryToken((token) => token + 1)
  }, [])

  return { data, loading, error, retry }
}
