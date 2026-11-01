// Minimal stand-in for zustand's create(): same (set, get) contract, no React.
// Lets the store be exercised in plain Node. The real library behaves the same
// for everything the tests use (getState, setState, selectors are not needed).
type Setter<T> = (partial: Partial<T> | ((state: T) => Partial<T> | T)) => void;

export function create<T>(init: (set: Setter<T>, get: () => T) => T) {
  let state: T;
  const listeners = new Set<(s: T) => void>();
  const setState: Setter<T> = (partial) => {
    const next = typeof partial === "function" ? (partial as (s: T) => Partial<T> | T)(state) : partial;
    if (next != null && next !== state) {
      state = Object.assign({}, state, next);
      listeners.forEach((l) => l(state));
    }
  };
  const getState = () => state;
  state = init(setState, getState);
  const hook = (<U>(selector?: (s: T) => U) => (selector ? selector(state) : state)) as {
    <U>(selector: (s: T) => U): U;
    getState: () => T;
    setState: Setter<T>;
    subscribe: (l: (s: T) => void) => () => void;
  };
  hook.getState = getState;
  hook.setState = setState;
  hook.subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
  return hook;
}
