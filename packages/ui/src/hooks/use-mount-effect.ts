// oxlint-disable-next-line crm/no-direct-effect -- the single sanctioned wrapper.
import { useEffect } from "react";

/**
 * The one sanctioned effect (see the `no-use-effect` skill and AGENTS.md): set up a
 * subscription to an external system on mount and tear it down on unmount. Not for derived
 * state, data fetching, or reacting to user actions. To read the latest props or state inside
 * the listener, wrap the handler in `useEffectEvent`.
 */
export function useMountEffect(effect: () => void | (() => void)) {
  // Mount-only by design: the effect must not re-run when the caller re-renders.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
