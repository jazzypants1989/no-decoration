/**
 * Observability plugin for debugging and monitoring.
 * Adds event subscriptions, validation, resolution context, and dependency graph.
 */

/** @import * as Types from '../core.js' */
/** @import * as ObsTypes from './observability.js' */

/** @type {ObsTypes.observability} */
export const observability = {
  name: "observability",

  /**
   * @param {Types.Container} container
   * @param {Types.ContainerInternals} internals
   */
  apply(container, internals) {
    const { hooks, resolutionStack } = internals

    /** @type {{ resolve: Set<ObsTypes.ResolveHandler>, dispose: Set<ObsTypes.DisposeHandler>, override: Set<ObsTypes.OverrideHandler> }} */
    const listeners = {
      resolve: new Set(),
      dispose: new Set(),
      override: new Set(),
    }

    /** @type {Map<Types.Factory<unknown>, Set<Types.Factory<unknown>>>} */
    const dependencyEdges = new Map()

    hooks.beforeResolve.push((/** @type {Types.Factory<unknown>} */ factory) => {
      const parentFactory = resolutionStack[resolutionStack.length - 1]
      if (parentFactory && parentFactory !== factory) {
        if (!dependencyEdges.has(parentFactory)) {
          dependencyEdges.set(parentFactory, new Set())
        }
        dependencyEdges.get(parentFactory)?.add(factory)
      }
    })

    hooks.afterResolve.push((/** @type {Types.Factory<unknown>} */ factory, /** @type {unknown} */ value, /** @type {number} */ ms) => {
      for (const handler of listeners.resolve) {
        handler(factory, value, ms)
      }
    })

    hooks.onDispose.push((/** @type {Types.Factory<unknown>} */ factory) => {
      for (const handler of listeners.dispose) {
        handler(factory)
      }
    })

    hooks.onOverride.push((/** @type {Types.Factory<unknown>} */ original, /** @type {Types.Factory<unknown>} */ replacement) => {
      for (const handler of listeners.override) {
        handler(original, replacement)
      }
    })

    return {
      /**
       * @param {"resolve" | "dispose" | "override"} event
       * @param {ObsTypes.ResolveHandler | ObsTypes.DisposeHandler | ObsTypes.OverrideHandler} handler
       */
      on(event, handler) {
        if (!listeners[event]) {
          throw new Error(`Unknown event: ${event}`)
        }
        listeners[event].add(/** @type {never} */ (handler))
        return () => listeners[event].delete(/** @type {never} */ (handler))
      },

      /** @param {Types.Factory<unknown>[]} factories */
      async validate(factories) {
        /** @type {ObsTypes.ValidationError[]} */
        const errors = []
        for (const factory of factories) {
          try {
            const result = container.get(factory)
            if (result instanceof Promise) await result
          } catch (e) {
            const name = factory.displayName || factory.name || "anonymous"
            errors.push({ factory: name, error: /** @type {Error} */ (e) })
          }
        }
        if (errors.length) {
          const msg = errors.map((e) => `  ${e.factory}: ${e.error.message}`).join("\n")
          throw new Error(`Validation failed:\n${msg}`)
        }
      },

      /** @param {Types.Factory<unknown>[]} factories */
      async validateReport(factories) {
        /** @type {ObsTypes.ValidationError[]} */
        const errors = []
        for (const factory of factories) {
          try {
            const result = container.get(factory)
            if (result instanceof Promise) await result
          } catch (e) {
            const name = factory.displayName || factory.name || "anonymous"
            errors.push({ factory: name, error: /** @type {Error} */ (e) })
          }
        }
        return { valid: errors.length === 0, errors }
      },

      getResolutionContext() {
        return {
          parent: resolutionStack[resolutionStack.length - 2] || null,
          depth: resolutionStack.length,
        }
      },

      getDependencyGraph() {
        return {
          edges: dependencyEdges,

          toMermaid() {
            let mermaid = "graph TD\n"
            for (const [from, deps] of dependencyEdges) {
              const fromName = from.displayName || from.name || "anonymous"
              for (const to of deps) {
                const toName = to.displayName || to.name || "anonymous"
                mermaid += `  ${fromName} --> ${toName}\n`
              }
            }
            return mermaid
          },

          getTopologicalOrder() {
            /** @type {Set<Types.Factory<unknown>>} */
            const visited = new Set()
            /** @type {Types.Factory<unknown>[]} */
            const order = []

            /** @param {Types.Factory<unknown>} factory */
            const visit = (factory) => {
              if (visited.has(factory)) return
              visited.add(factory)
              const deps = dependencyEdges.get(factory) || new Set()
              for (const dep of deps) visit(dep)
              order.push(factory)
            }

            for (const factory of dependencyEdges.keys()) visit(factory)
            return order.reverse()
          },
        }
      },
    }
  },
}
