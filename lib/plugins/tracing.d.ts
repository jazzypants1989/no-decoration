/**
 * Tracing Plugin - Type Declarations
 *
 * OpenTelemetry-style distributed tracing for factory resolution.
 * Creates spans with proper parent-child relationships.
 */

import type { Plugin } from "../core.js"

// ═══════════════════════════════════════════════════════════════════════════
// SPAN TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A span event (annotation/log).
 */
export interface SpanEvent {
  name: string
  timestamp: number
  attributes?: Record<string, unknown>
}

/**
 * A trace span representing a unit of work.
 */
export interface Span {
  /** Unique identifier for the entire trace */
  traceId: string
  /** Unique identifier for this span */
  spanId: string
  /** Parent span ID (if this is a child span) */
  parentSpanId?: string
  /** Name of the operation */
  operationName: string
  /** Service name */
  serviceName: string
  /** Start time in milliseconds (high-resolution) */
  startTime: number
  /** End time in milliseconds (high-resolution) */
  endTime: number
  /** Duration in milliseconds */
  duration: number
  /** Span status */
  status: "OK" | "ERROR"
  /** Span attributes/tags */
  attributes: Record<string, unknown>
  /** Span events/logs */
  events: SpanEvent[]
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * External tracer interface (OpenTelemetry-compatible).
 */
export interface ExternalTracer {
  startSpan(
    name: string,
    options?: { attributes?: Record<string, unknown> }
  ): { end(): void }
}

/**
 * Options for the tracing plugin.
 */
export interface TracingOptions {
  /**
   * Service name for spans.
   * @default "di-container"
   */
  serviceName?: string

  /**
   * Callback when a span starts.
   */
  onSpanStart?: (span: Span) => void

  /**
   * Callback when a span ends.
   */
  onSpanEnd?: (span: Span) => void

  /**
   * External OpenTelemetry-compatible tracer.
   * If provided, spans will be created through this tracer.
   */
  tracer?: ExternalTracer
}

/**
 * Options for creating a manual span.
 */
export interface SpanOptions {
  /** Parent span ID to link to */
  parentSpanId?: string
  /** Additional attributes for the span */
  attributes?: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FORMATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Jaeger-compatible JSON export format.
 */
export interface JaegerExport {
  data: Array<{
    traceID: string
    spans: Array<{
      traceID: string
      spanID: string
      parentSpanID: string
      operationName: string
      startTime: number
      duration: number
      tags: Array<{ key: string; type: string; value: unknown }>
      logs: Array<{
        timestamp: number
        fields: Array<{ key: string; type: string; value: unknown }>
      }>
      processID: string
    }>
    processes: Record<string, { serviceName: string; tags: unknown[] }>
  }>
}

/**
 * Zipkin-compatible JSON export format.
 */
export interface ZipkinSpan {
  traceId: string
  id: string
  parentId?: string
  name: string
  timestamp: number
  duration: number
  localEndpoint: { serviceName: string }
  tags: Record<string, string>
  annotations: Array<{ timestamp: number; value: string }>
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN METHODS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Methods added to the container by the tracing plugin.
 */
export interface TracingMethods {
  /**
   * Get all currently active (in-progress) spans.
   */
  getActiveSpans(): Span[]

  /**
   * Get all completed spans.
   *
   * @example
   * ```ts
   * const spans = container.getCompletedSpans()
   * for (const span of spans) {
   *   console.log(`${span.operationName}: ${span.duration}ms`)
   * }
   * ```
   */
  getCompletedSpans(): Span[]

  /**
   * Get all spans for a specific trace.
   *
   * @example
   * ```ts
   * const traceId = container.getCurrentTraceId()
   * const spans = container.getSpansByTrace(traceId)
   * ```
   */
  getSpansByTrace(traceId: string): Span[]

  /**
   * Get the current trace ID.
   */
  getCurrentTraceId(): string

  /**
   * Start a new trace (generates new trace ID).
   * Call this at the start of each request.
   *
   * @example
   * ```ts
   * app.use((req, res, next) => {
   *   const traceId = container.startNewTrace()
   *   req.traceId = traceId
   *   next()
   * })
   * ```
   */
  startNewTrace(): string

  /**
   * Clear all completed spans.
   * Useful for testing or periodic cleanup.
   */
  clearSpans(): void

  /**
   * Create a manual span around a function.
   * Useful for tracing operations outside of factory resolution.
   *
   * @example
   * ```ts
   * const result = await container.withSpan("fetchUsers")(async () => {
   *   return await fetch("/api/users")
   * })
   * ```
   */
  withSpan<T>(
    name: string,
    options?: SpanOptions
  ): (fn: () => T | Promise<T>) => Promise<T>

  /**
   * Export spans in Jaeger-compatible JSON format.
   *
   * @example
   * ```ts
   * const jaegerData = container.toJaegerJSON()
   * await fetch("http://jaeger:14268/api/traces", {
   *   method: "POST",
   *   body: JSON.stringify(jaegerData)
   * })
   * ```
   */
  toJaegerJSON(): JaegerExport

  /**
   * Export spans in Zipkin-compatible JSON format.
   *
   * @example
   * ```ts
   * const zipkinSpans = container.toZipkinJSON()
   * await fetch("http://zipkin:9411/api/v2/spans", {
   *   method: "POST",
   *   body: JSON.stringify(zipkinSpans)
   * })
   * ```
   */
  toZipkinJSON(): ZipkinSpan[]
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a tracing plugin for OpenTelemetry-style distributed tracing.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * import { createContainer } from 'no-decoration/core'
 * import { tracing } from 'no-decoration/plugins/tracing'
 *
 * const container = createContainer().with(tracing({
 *   serviceName: "user-service",
 *   onSpanEnd: (span) => {
 *     if (span.duration > 100) {
 *       console.warn(`Slow resolution: ${span.operationName}`)
 *     }
 *   }
 * }))
 *
 * // Each request gets a new trace
 * app.use((req, res, next) => {
 *   container.startNewTrace()
 *   next()
 * })
 *
 * // Resolve factories (spans created automatically)
 * container.get(userService)
 *
 * // Export to tracing backend
 * const spans = container.toZipkinJSON()
 * ```
 *
 * @example
 * ```ts
 * // Integration with OpenTelemetry
 * import { trace } from '@opentelemetry/api'
 *
 * const container = createContainer().with(tracing({
 *   tracer: trace.getTracer('my-service')
 * }))
 * ```
 */
export declare function tracing(options?: TracingOptions): Plugin<TracingMethods>
