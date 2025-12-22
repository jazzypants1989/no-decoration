/**
 * Debug plugin for development-time logging and diagnostics.
 */

import type { Container, ContainerInternals, Plugin } from "../core.js"

/**
 * Options for the debug plugin.
 */
export interface DebugOptions {
  /**
   * Log resolution timing.
   * @default true
   */
  timing?: boolean

  /**
   * Show warnings for common issues (slow factories, anonymous factories).
   * @default true
   */
  warnings?: boolean

  /**
   * Logger to use for output.
   * @default console
   */
  logger?: {
    log: (...args: any[]) => void
    warn: (...args: any[]) => void
  }
}

/**
 * Debug plugin with configuration support.
 */
export interface DebugPlugin extends Plugin<{}> {
  /**
   * Create a debug plugin with custom options.
   */
  configure(options: DebugOptions): Plugin<{}>
}

/**
 * Debug plugin for development-time logging and diagnostics.
 *
 * @example
 * import { createContainer } from 'no-decoration'
 * import { debug } from 'no-decoration/plugins/debug'
 *
 * const container = createContainer().with(debug)
 */
export const debug: DebugPlugin
