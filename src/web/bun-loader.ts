/**
 * Node.js ESM loader hook that intercepts `bun:bundle` imports.
 * Provides a `feature()` function that always returns false,
 * matching the open-source build behavior.
 */

export function resolve(specifier: string, context: any, nextResolve: any) {
  if (specifier === 'bun:bundle') {
    return {
      shortCircuit: true,
      url: 'data:text/javascript,export function feature(){return false}',
    }
  }
  return nextResolve(specifier, context)
}
