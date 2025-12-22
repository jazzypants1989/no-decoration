/**
 * Metrics plugin for Prometheus-style monitoring.
 * Tracks resolution counts, timing histograms, and errors.
 */

/** @import * as Types from '../core.js' */
/** @import * as MetricsTypes from './metrics.js' */

/**
 * Default histogram buckets (in milliseconds)
 * Based on common latency patterns
 */
const DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]

/**
 * @param {MetricsTypes.MetricsOptions} [options]
 * @returns {Types.Plugin<MetricsTypes.MetricsMethods>}
 */
export function metrics(options = {}) {
  const {
    prefix = "di",
    buckets = DEFAULT_BUCKETS,
    labels = {},
  } = options

  return {
    name: "metrics",

    /**
     * @param {Types.Container} _container
     * @param {Types.ContainerInternals} internals
     */
    apply(_container, internals) {
      const { hooks } = internals

      // Counters
      /** @type {Map<string, number>} */
      const resolutionCounts = new Map()
      /** @type {Map<string, number>} */
      const errorCounts = new Map()

      // Histograms - store individual observations for each factory
      /** @type {Map<string, number[]>} */
      const resolutionTimes = new Map()

      // Gauges
      let activeResolutions = 0
      let peakActiveResolutions = 0

      // Track timing
      /** @type {Map<Types.Factory<unknown>, number>} */
      const startTimes = new Map()

      hooks.beforeResolve.push((factory) => {
        const name = factory.displayName || factory.name || "anonymous"
        startTimes.set(factory, performance.now())
        activeResolutions++
        if (activeResolutions > peakActiveResolutions) {
          peakActiveResolutions = activeResolutions
        }
      })

      hooks.afterResolve.push((factory, _value, ms) => {
        const name = factory.displayName || factory.name || "anonymous"
        startTimes.delete(factory)
        activeResolutions--

        // Increment counter
        resolutionCounts.set(name, (resolutionCounts.get(name) || 0) + 1)

        // Record timing
        if (!resolutionTimes.has(name)) {
          resolutionTimes.set(name, [])
        }
        resolutionTimes.get(name)?.push(ms)
      })

      /**
       * @param {string} name
       */
      const recordError = (name) => {
        errorCounts.set(name, (errorCounts.get(name) || 0) + 1)
      }

      /**
       * @param {string} name
       * @param {number[]} observations
       * @returns {MetricsTypes.HistogramData}
       */
      const computeHistogram = (name, observations) => {
        if (observations.length === 0) {
          return {
            count: 0,
            sum: 0,
            buckets: buckets.map((le) => ({ le, count: 0 })),
          }
        }

        const sum = observations.reduce((a, b) => a + b, 0)
        const bucketCounts = buckets.map((le) => ({
          le,
          count: observations.filter((v) => v <= le).length,
        }))

        return {
          count: observations.length,
          sum,
          buckets: bucketCounts,
        }
      }

      /**
       * @param {string} metricName
       * @param {Record<string, string>} metricLabels
       * @returns {string}
       */
      const formatLabels = (metricName, metricLabels) => {
        const allLabels = { ...labels, ...metricLabels }
        const labelPairs = Object.entries(allLabels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",")
        return labelPairs ? `{${labelPairs}}` : ""
      }

      return {
        getCounter(name) {
          return resolutionCounts.get(name) || 0
        },

        getErrorCount(name) {
          return errorCounts.get(name) || 0
        },

        getHistogram(name) {
          const observations = resolutionTimes.get(name) || []
          return computeHistogram(name, observations)
        },

        getActiveResolutions() {
          return activeResolutions
        },

        getPeakActiveResolutions() {
          return peakActiveResolutions
        },

        getAllMetrics() {
          /** @type {MetricsTypes.AllMetrics} */
          const result = {
            counters: new Map(resolutionCounts),
            errors: new Map(errorCounts),
            histograms: new Map(),
            activeResolutions,
            peakActiveResolutions,
          }

          for (const [name, observations] of resolutionTimes) {
            result.histograms.set(name, computeHistogram(name, observations))
          }

          return result
        },

        recordError(factoryName) {
          recordError(factoryName)
        },

        resetMetrics() {
          resolutionCounts.clear()
          errorCounts.clear()
          resolutionTimes.clear()
          activeResolutions = 0
          peakActiveResolutions = 0
        },

        toPrometheus() {
          const lines = []
          const ts = Date.now()

          // Resolution counter
          lines.push(`# HELP ${prefix}_resolutions_total Total number of factory resolutions`)
          lines.push(`# TYPE ${prefix}_resolutions_total counter`)
          for (const [name, count] of resolutionCounts) {
            const labelStr = formatLabels(name, { factory: name })
            lines.push(`${prefix}_resolutions_total${labelStr} ${count}`)
          }

          // Error counter
          lines.push(`# HELP ${prefix}_errors_total Total number of resolution errors`)
          lines.push(`# TYPE ${prefix}_errors_total counter`)
          for (const [name, count] of errorCounts) {
            const labelStr = formatLabels(name, { factory: name })
            lines.push(`${prefix}_errors_total${labelStr} ${count}`)
          }

          // Resolution time histogram
          lines.push(`# HELP ${prefix}_resolution_duration_ms Factory resolution duration in milliseconds`)
          lines.push(`# TYPE ${prefix}_resolution_duration_ms histogram`)
          for (const [name, observations] of resolutionTimes) {
            const histogram = computeHistogram(name, observations)
            const baseLabels = { factory: name }

            for (const bucket of histogram.buckets) {
              const labelStr = formatLabels(name, { ...baseLabels, le: String(bucket.le) })
              lines.push(`${prefix}_resolution_duration_ms_bucket${labelStr} ${bucket.count}`)
            }

            const infLabelStr = formatLabels(name, { ...baseLabels, le: "+Inf" })
            lines.push(`${prefix}_resolution_duration_ms_bucket${infLabelStr} ${histogram.count}`)

            const sumLabelStr = formatLabels(name, baseLabels)
            lines.push(`${prefix}_resolution_duration_ms_sum${sumLabelStr} ${histogram.sum}`)
            lines.push(`${prefix}_resolution_duration_ms_count${sumLabelStr} ${histogram.count}`)
          }

          // Active resolutions gauge
          lines.push(`# HELP ${prefix}_active_resolutions Current number of active resolutions`)
          lines.push(`# TYPE ${prefix}_active_resolutions gauge`)
          lines.push(`${prefix}_active_resolutions ${activeResolutions}`)

          // Peak active resolutions gauge
          lines.push(`# HELP ${prefix}_peak_active_resolutions Peak number of concurrent resolutions`)
          lines.push(`# TYPE ${prefix}_peak_active_resolutions gauge`)
          lines.push(`${prefix}_peak_active_resolutions ${peakActiveResolutions}`)

          return lines.join("\n")
        },
      }
    },
  }
}
