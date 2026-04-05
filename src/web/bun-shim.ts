/**
 * Shim for bun:bundle feature() macro used throughout the codebase.
 * When running under Node.js (not Bun), all feature flags return false
 * which disables internal-only features (voice, bridge, daemon, etc.)
 * — exactly the same behavior as the open-source build.
 */

// Register the bun:bundle module hook
import { register } from 'module'

register('./bun-loader.ts', import.meta.url)
