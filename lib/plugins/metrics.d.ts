/**
 * Metrics Plugin - Type Declarations
 *
 * Prometheus-style metrics for monitoring factory resolution.
 * Tracks counters, histograms, and gauges.
 */

import type { Plugin } from "../core.js"

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for the metrics plugin.
 */
export interface MetricsOptions {
  /**
   * Prefix for all metric names.
   * @default "di"
   */
  prefix?: string

  /**
   * Histogram bucket boundaries in milliseconds.
   * @default [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
   */
  buckets?: number[]

  /**
   * Additional labels to add to all metrics.
   */
  labels?: Record<string, string>
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single histogram bucket.
 */
export interface HistogramBucket {
  /** Upper bound (less than or equal) */
  le: number
  /** Count of observations in this bucket */
  count: number
}

/**
 * Histogram data for a factory.
 */
export interface HistogramData {
  /** Total number of observations */
  count: number
  /** Sum of all observations */
  sum: number
  /** Bucket counts */
  buckets: HistogramBucket[]
}

/**
 * All metrics collected by the plugin.
 */
export interface AllMetrics {
  /** Resolution counts per factory */
  counters: Map<string, number>
  /** Error counts per factory */
  errors: Map<string, number>
  /** Resolution time histograms per factory */
  histograms: Map<string, HistogramData>
  /** Current number of active resolutions */
  activeResolutions: number
  /** Peak number of concurrent resolutions */
  peakActiveResolutions: number
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN METHODS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Methods added to the container by the metrics plugin.
 */
export interface MetricsMethods {
  /**
   * Get the resolution count for a specific factory.
   *
   * @example
   * ```ts
   * const count = container.getCounter("Database")
   * console.log(`Database resolved ${count} times`)
   * ```
   */
  getCounter(factoryName: string): number

  /**
   * Get the error count for a specific factory.
   *
   * @example
   * ```ts
   * const errors = container.getErrorCount("ExternalAPI")
   * if (errors > 10) console.warn("High error rate!")
   * ```
   */
  getErrorCount(factoryName: string): number

  /**
   * Get the resolution time histogram for a specific factory.
   *
   * @example
   * ```ts
   * const histogram = container.getHistogram("Database")
   * console.log(`Average: ${histogram.sum / histogram.count}ms`)
   * ```
   */
  getHistogram(factoryName: string): HistogramData

  /**
   * Get the current number of active (in-progress) resolutions.
   */
  getActiveResolutions(): number

  /**
   * Get the peak number of concurrent resolutions seen.
   */
  getPeakActiveResolutions(): number

  /**
   * Get all collected metrics.
   *
   * @example
   * ```ts
   * const all = container.getAllMetrics()
   * for (const [name, count] of all.counters) {
   *   console.log(`${name}: ${count} resolutions`)
   * }
   * ```
   */
  getAllMetrics(): AllMetrics

  /**
   * Manually record an error for a factory.
   * Useful when catching errors in custom error handlers.
   *
   * @example
   * ```ts
   * try {
   *   container.get(riskyFactory)
   * } catch (e) {
   *   container.recordError("riskyFactory")
   *   throw e
   * }
   * ```
   */
  recordError(factoryName: string): void

  /**
   * Reset all metrics to zero.
   *
   * @example
   * ```ts
   * // Reset between test runs
   * beforeEach(() => container.resetMetrics())
   * ```
   */
  resetMetrics(): void

  /**
   * Export metrics in Prometheus text format.
   *
   * @example
   * ```ts
   * // Expose /metrics endpoint
   * app.get("/metrics", (req, res) => {
   *   res.type("text/plain")
   *   res.send(container.toPrometheus())
   * })
   * ```
   *
   * @example
   * ```ts
   * // Example output:
   * // # HELP di_resolutions_total Total number of factory resolutions
   * // # TYPE di_resolutions_total counter
   * // di_resolutions_total{factory="Database"} 42
   * // # HELP di_resolution_duration_ms Factory resolution duration
   * // # TYPE di_resolution_duration_ms histogram
   * // di_resolution_duration_ms_bucket{factory="Database",le="10"} 35
   * // di_resolution_duration_ms_bucket{factory="Database",le="50"} 40
   * // ...
   * ```
   */
  toPrometheus(): string
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a metrics plugin for Prometheus-style monitoring.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * import { createContainer } from 'no-decoration/core'
 * import { metrics } from 'no-decoration/plugins/metrics'
 *
 * const container = createContainer().with(metrics({
 *   prefix: "myapp_di",
 *   labels: { environment: "production" }
 * }))
 *
 * // Resolve some factories...
 * container.get(database)
 * container.get(userService)
 *
 * // Export to Prometheus
 * console.log(container.toPrometheus())
 * ```
 */
export declare function metrics(options?: MetricsOptions): Plugin<MetricsMethods>
