import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * Returns a callback with a permanently stable identity that always invokes the
 * latest version of `fn`.
 *
 * Parent screens rebuild their handlers as inline closures on every render, which
 * defeats React.memo on list rows. Wrapping those handlers here lets rows stay
 * memoized so toggling one verse re-renders one row instead of the whole page.
 */
export function useEvent<Args extends unknown[], R>(
  fn: (...args: Args) => R,
): (...args: Args) => R {
  const ref = useRef(fn);
  // Insertion effects run before layout/passive effects, so the ref is current
  // by the time any handler can fire, without mutating a ref during render.
  useInsertionEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
