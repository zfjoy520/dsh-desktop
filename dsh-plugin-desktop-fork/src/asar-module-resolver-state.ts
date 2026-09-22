/** Process-local ownership marker shared with the patched upstream fallback. */

const RESOLVER_MARKER = Symbol.for('dsh-plugin-desktop-fork.asar-module-resolver')
/**
 * Compatibility marker read by the vendored `@deepseek-ai/dsh-agent-presets`
 * and `@deepseek-ai/dsh-plugin-package-inventory-deepseek` packages, which
 * hardcode the stable symbol. The fork resolver owns resolution the same way
 * stable does, so it publishes both counts in lockstep.
 */
const STABLE_RESOLVER_MARKER = Symbol.for('dsh-plugin-desktop.asar-module-resolver')

type ResolverState = Record<PropertyKey, unknown>

function state(): ResolverState {
  return globalThis as unknown as ResolverState
}

function retainedResolverCount(marker: symbol): number {
  const count = state()[marker]
  return typeof count === 'number' ? count : 0
}

/**
 * Mark one active resolver. Patched upstream packages read this count to learn
 * that Desktop owns module resolution and that walking node_modules would fail:
 * the Desktop package ships outside any node_modules tree.
 */
export function retainAsarModuleResolver(): () => void {
  state()[RESOLVER_MARKER] = retainedResolverCount(RESOLVER_MARKER) + 1
  state()[STABLE_RESOLVER_MARKER] = retainedResolverCount(STABLE_RESOLVER_MARKER) + 1
  let active = true
  return () => {
    if (!active) return
    active = false
    const remaining = retainedResolverCount(RESOLVER_MARKER) - 1
    if (remaining > 0) state()[RESOLVER_MARKER] = remaining
    else delete state()[RESOLVER_MARKER]
    const stableRemaining = retainedResolverCount(STABLE_RESOLVER_MARKER) - 1
    if (stableRemaining > 0) state()[STABLE_RESOLVER_MARKER] = stableRemaining
    else delete state()[STABLE_RESOLVER_MARKER]
  }
}
