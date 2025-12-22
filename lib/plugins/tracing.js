/**
 * Tracing plugin for OpenTelemetry-style distributed tracing.
 * Creates spans for factory resolution with proper parent-child relationships.
 */

/** @import * as Types from '../core.js' */
/** @import * as TracingTypes from './tracing.js' */

/**
 * @param {TracingTypes.TracingOptions} [options]
 * @returns {Types.Plugin<TracingTypes.TracingMethods>}
 */
export function tracing(options = {}) {
  const {
    serviceName = "di-container",
    onSpanStart,
    onSpanEnd,
    tracer,
  } = options

  return {
    name: "tracing",

    /**
     * @param {Types.Container} _container
     * @param {Types.ContainerInternals} internals
     */
    apply(_container, internals) {
      const { hooks, resolutionStack } = internals

      /** @type {Map<Types.Factory<unknown>, TracingTypes.Span>} */
      const activeSpans = new Map()

      /** @type {TracingTypes.Span[]} */
      const completedSpans = []

      let spanIdCounter = 0
      let traceId = generateTraceId()

      /**
       * @returns {string}
       */
      function generateTraceId() {
        return Math.random().toString(16).slice(2, 18).padStart(16, "0")
      }

      /**
       * @returns {string}
       */
      function generateSpanId() {
        return (++spanIdCounter).toString(16).padStart(8, "0")
      }

      hooks.beforeResolve.push((factory) => {
        const name = factory.displayName || factory.name || "anonymous"
        const parentFactory = resolutionStack[resolutionStack.length - 1]
        const parentSpan = parentFactory ? activeSpans.get(parentFactory) : undefined

        /** @type {TracingTypes.Span} */
        const span = {
          traceId: parentSpan?.traceId || traceId,
          spanId: generateSpanId(),
          parentSpanId: parentSpan?.spanId,
          operationName: `resolve:${name}`,
          serviceName,
          startTime: performance.now(),
          endTime: 0,
          duration: 0,
          status: "OK",
          attributes: {
            "di.factory.name": name,
            "di.factory.transient": Boolean(factory._transient),
          },
          events: [],
        }

        activeSpans.set(factory, span)

        if (tracer) {
          // If external tracer provided, delegate to it
          const externalSpan = tracer.startSpan(span.operationName, {
            attributes: span.attributes,
          })
          // @ts-ignore - attach external span reference
          span._externalSpan = externalSpan
        }

        onSpanStart?.(span)
      })

      hooks.afterResolve.push((factory, value, ms) => {
        const span = activeSpans.get(factory)
        if (!span) return

        span.endTime = performance.now()
        span.duration = ms
        span.attributes["di.resolution.cached"] = false

        activeSpans.delete(factory)
        completedSpans.push(span)

        if (tracer) {
          // @ts-ignore - get external span
          const externalSpan = span._externalSpan
          externalSpan?.end()
        }

        onSpanEnd?.(span)
      })

      return {
        getActiveSpans() {
          return Array.from(activeSpans.values())
        },

        getCompletedSpans() {
          return [...completedSpans]
        },

        getSpansByTrace(traceIdToFind) {
          return completedSpans.filter((s) => s.traceId === traceIdToFind)
        },

        getCurrentTraceId() {
          return traceId
        },

        startNewTrace() {
          traceId = generateTraceId()
          spanIdCounter = 0
          return traceId
        },

        clearSpans() {
          completedSpans.length = 0
        },

        /**
         * @param {string} name
         * @param {TracingTypes.SpanOptions} [spanOptions]
         */
        withSpan(name, spanOptions = {}) {
          /**
           * @template T
           * @param {() => T | Promise<T>} fn
           * @returns {Promise<T>}
           */
          return async (fn) => {
            const parentSpan = completedSpans[completedSpans.length - 1]

            /** @type {TracingTypes.Span} */
            const span = {
              traceId: parentSpan?.traceId || traceId,
              spanId: generateSpanId(),
              parentSpanId: spanOptions.parentSpanId || parentSpan?.spanId,
              operationName: name,
              serviceName,
              startTime: performance.now(),
              endTime: 0,
              duration: 0,
              status: "OK",
              attributes: spanOptions.attributes || {},
              events: [],
            }

            onSpanStart?.(span)

            try {
              const result = await fn()
              span.endTime = performance.now()
              span.duration = span.endTime - span.startTime
              completedSpans.push(span)
              onSpanEnd?.(span)
              return result
            } catch (error) {
              span.endTime = performance.now()
              span.duration = span.endTime - span.startTime
              span.status = "ERROR"
              span.attributes["error"] = true
              span.attributes["error.message"] =
                error instanceof Error ? error.message : String(error)
              span.events.push({
                name: "exception",
                timestamp: span.endTime,
                attributes: {
                  "exception.message":
                    error instanceof Error ? error.message : String(error),
                },
              })
              completedSpans.push(span)
              onSpanEnd?.(span)
              throw error
            }
          }
        },

        toJaegerJSON() {
          return {
            data: [
              {
                traceID: traceId,
                spans: completedSpans.map((span) => ({
                  traceID: span.traceId,
                  spanID: span.spanId,
                  parentSpanID: span.parentSpanId || "",
                  operationName: span.operationName,
                  startTime: Math.floor(span.startTime * 1000), // microseconds
                  duration: Math.floor(span.duration * 1000),
                  tags: Object.entries(span.attributes).map(([key, value]) => ({
                    key,
                    type: typeof value,
                    value,
                  })),
                  logs: span.events.map((event) => ({
                    timestamp: Math.floor(event.timestamp * 1000),
                    fields: [
                      { key: "event", type: "string", value: event.name },
                      ...Object.entries(event.attributes || {}).map(
                        ([key, value]) => ({
                          key,
                          type: typeof value,
                          value,
                        })
                      ),
                    ],
                  })),
                  processID: "p1",
                })),
                processes: {
                  p1: {
                    serviceName,
                    tags: [],
                  },
                },
              },
            ],
          }
        },

        toZipkinJSON() {
          return completedSpans.map((span) => ({
            traceId: span.traceId,
            id: span.spanId,
            parentId: span.parentSpanId,
            name: span.operationName,
            timestamp: Math.floor(span.startTime * 1000),
            duration: Math.floor(span.duration * 1000),
            localEndpoint: {
              serviceName,
            },
            tags: Object.fromEntries(
              Object.entries(span.attributes).map(([k, v]) => [k, String(v)])
            ),
            annotations: span.events.map((event) => ({
              timestamp: Math.floor(event.timestamp * 1000),
              value: event.name,
            })),
          }))
        },
      }
    },
  }
}
