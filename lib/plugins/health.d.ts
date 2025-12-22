import { Container, Plugin } from "../core.js"

export interface HealthCheckResult {
  healthy: boolean
  ms: number
  error?: Error
}

export interface HealthReport {
  healthy: boolean
  checks: Map<string, HealthCheckResult>
}

export interface HealthMethods {
  onHealthCheck(name: string, check: () => Promise<void>): void
  checkHealth(): Promise<HealthReport>
}

export const health: Plugin<HealthMethods>
