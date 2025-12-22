// =============================================================================
// Request Context Module
// =============================================================================
// Depends on: (created per-request with request data)
// Demonstrates: request-scoped factory, scoped() helper

import { factory, scoped } from "no-decoration"

export class RequestContext {
  /**
   * @param {string} requestId
   * @param {string} method
   * @param {string} url
   */
  constructor(requestId, method, url) {
    this.requestId = requestId
    this.method = method
    this.url = url
    this.startTime = Date.now()
  }

  get elapsed() {
    return Date.now() - this.startTime
  }
}

// scoped() creates a factory builder that takes request-specific arguments
// Usage: requestContext(requestId, method, url) returns a Factory<RequestContext>
export const requestContext = scoped(
  /**
   * @param {import("no-decoration").Container} _
   * @param {string} requestId
   * @param {string} method
   * @param {string} url
   */
  (_, requestId, method, url) => new RequestContext(requestId, method, url)
)
