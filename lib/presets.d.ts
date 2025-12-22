import { ComposedPlugin } from "./core"
import { HealthMethods } from "./plugins/health"
import { ObservabilityMethods } from "./plugins/observability"
import { TestingMethods } from "./plugins/testing"
import { DebugPlugin } from "./plugins/debug"
import { MetricsMethods } from "./plugins/metrics"

/**
 * Production preset: health checks + observability + metrics.
 * Includes Prometheus-style metrics export.
 * No testing utilities.
 */
export const production: ComposedPlugin<
  HealthMethods & ObservabilityMethods & MetricsMethods
>

/**
 * Development preset: all plugins including debug logging.
 * Includes health, observability, testing utilities, and debug output.
 */
export const development: ComposedPlugin<
  HealthMethods & ObservabilityMethods & TestingMethods & DebugPlugin
>

/**
 * Testing preset: just testing utilities.
 */
export const testOnly: ComposedPlugin<TestingMethods>
