/**
 * Debounce a rapidly-changing value.
 *
 * Used for search inputs. Without it, every keystroke fires a request: typing an eight
 * character order number would issue eight queries, seven of which are discarded, and
 * each of which opens its own database connection on the Worker.
 */
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    // Clearing on every change is what makes this a debounce rather than a throttle —
    // and it prevents a pending timer firing setState after unmount.
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
