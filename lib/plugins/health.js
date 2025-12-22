/**
 * Health check plugin for production reliability.
 * Adds onHealthCheck() and checkHealth() methods to the container.
 */

/** @import * as Types from '../core.js' */
/** @import * as HealthTypes from './health.js' */

/** @type {HealthTypes.health} */
export const health = {
  name: "health",

  /**
   * @param {Types.Container} container
   * @param {Types.ContainerInternals} internals
   */
  apply(container, internals) {
    /** @type {Map<string, () => Promise<void>>} */
    const healthChecks = new Map()

    return {
      /**
       * @param {string} name
       * @param {() => Promise<void>} check
       */
      onHealthCheck(name, check) {
        healthChecks.set(name, check)
      },

      async checkHealth() {
        /** @type {Map<string, HealthTypes.HealthCheckResult>} */
        const results = new Map()
        let allHealthy = true

        for (const [name, check] of healthChecks) {
          const start = performance.now()
          try {
            await check()
            results.set(name, { healthy: true, ms: performance.now() - start })
          } catch (error) {
            allHealthy = false
            results.set(name, {
              healthy: false,
              ms: performance.now() - start,
              error: /** @type {Error} */ (error),
            })
          }
        }

        return { healthy: allHealthy, checks: results }
      },
    }
  },
}
