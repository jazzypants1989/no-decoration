/**
 * Built-in plugins for no-decoration.
 *
 * @example
 * import { createContainer } from 'no-decoration/core'
 * import { health, observability, testing } from 'no-decoration/plugins'
 *
 * const container = createContainer()
 *   .with(health)
 *   .with(observability)
 */

export { health } from "./health.js"
export { observability } from "./observability.js"
export { testing } from "./testing.js"
export { debug } from "./debug.js"
export {
  discover,
  createCache,
  createDiscoveryResult,
  parseString,
  patterns
} from "./discover.js"
export { batch, defineFactories } from "./batch.js"
export {
  circuitBreaker,
  circuitBreakerPlugin,
  CircuitState,
  CircuitOpenError,
} from "./circuit-breaker.js"
export {
  ttlCache,
  slidingCache,
  refreshAhead,
  keyedCache,
  cachePlugin,
} from "./cache.js"
export { metrics } from "./metrics.js"
export { tracing } from "./tracing.js"
