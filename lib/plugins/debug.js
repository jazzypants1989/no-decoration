/**
 * Debug plugin for development-time logging and diagnostics.
 */

/** @import * as Types from '../core.js' */
/** @import * as DebugTypes from './debug.js' */

/** @type {DebugTypes.DebugPlugin} */
export const debug = {
  name: "debug",

  /**
   * @param {Types.Container} container
   * @param {Types.ContainerInternals} internals
   */
  apply(container, internals) {
    return applyDebug(container, internals, {})
  },

  /**
   * @param {DebugTypes.DebugOptions} options
   * @returns {Types.Plugin<{}>}
   */
  configure(options) {
    return {
      name: "debug",
      /**
       * @param {Types.Container} container
       * @param {Types.ContainerInternals} internals
       */
      apply(container, internals) {
        return applyDebug(container, internals, options)
      },
    }
  },
}

/**
 * @param {Types.Container} container
 * @param {Types.ContainerInternals} internals
 * @param {DebugTypes.DebugOptions} options
 */
function applyDebug(container, internals, options) {
  const { hooks, resolutionStack, parent, cache } = internals
  const timing = options.timing ?? true
  const warnings = options.warnings ?? true
  const logger = options.logger ?? console

  const SLOW_THRESHOLD_MS = 1000

  hooks.beforeResolve.push((factory) => {
    const name = factory.displayName || factory.name || "anonymous"
    const indent = "  ".repeat(resolutionStack.length)

    if (timing) {
      logger.log(`[DI] ${indent}Resolving: ${name}`)
    }

    if (warnings && !factory.displayName && !factory.name) {
      logger.warn(`[DI WARN] Anonymous factory detected. Use factory() or named() for better debugging.`)
    }

    // Warn when a singleton is resolved in a child container that could have been inherited
    if (warnings && parent && !factory._transient && !cache.has(factory) && !parent.has(factory)) {
      logger.warn(
        `[DI WARN] Singleton '${name}' resolved in child container. ` +
          `Consider adding it to warmup() at startup so child containers share the same instance.`
      )
    }
  })

  hooks.afterResolve.push((factory, value, ms) => {
    const name = factory.displayName || factory.name || "anonymous"
    const indent = "  ".repeat(Math.max(0, resolutionStack.length - 1))

    if (timing) {
      logger.log(`[DI] ${indent}Resolved: ${name} (${ms.toFixed(2)}ms)`)
    }

    if (warnings && ms > SLOW_THRESHOLD_MS) {
      logger.warn(
        `[DI WARN] Factory '${name}' took ${ms.toFixed(0)}ms to resolve. ` +
          `Consider using timeout() or lazy loading.`
      )
    }
  })

  hooks.onOverride.push((original, replacement) => {
    const origName = original.displayName || original.name || "anonymous"
    const replName = replacement.displayName || replacement.name || "anonymous"

    if (timing) {
      logger.log(`[DI] Override: ${origName} -> ${replName}`)
    }
  })

  hooks.onDispose.push((factory) => {
    const name = factory.displayName || factory.name || "anonymous"

    if (timing) {
      logger.log(`[DI] Disposed: ${name}`)
    }
  })

  return {}
}
