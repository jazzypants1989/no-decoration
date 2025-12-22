/**
 * Pre-built plugin combinations for common use cases.
 *
 * @example
 * import { createContainer } from 'no-decoration/core'
 * import { production } from 'no-decoration/presets'
 *
 * const container = createContainer().with(production)
 */

import { pipe } from "./core.js"
import { health } from "./plugins/health.js"
import { observability } from "./plugins/observability.js"
import { testing } from "./plugins/testing.js"
import { debug } from "./plugins/debug.js"
import { metrics } from "./plugins/metrics.js"

/**
 * Production preset: health checks + observability + metrics.
 * Includes Prometheus-style metrics export.
 * No testing utilities (withMocks, snapshot, restore).
 */
export const production = pipe(health, observability, metrics())

/**
 * Development preset: all plugins including debug logging.
 * Includes health, observability, testing utilities, and debug output.
 */
export const development = pipe(health, observability, testing, debug)

/**
 * Testing preset: just testing utilities.
 * Minimal footprint for unit tests.
 */
export const testOnly = testing
