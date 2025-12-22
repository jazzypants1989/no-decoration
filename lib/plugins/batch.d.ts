import type { Container, Factory } from "../core.js"

/**
 * Define multiple named factories at once.
 * Supports forward references when using the builder function.
 */
export function defineFactories<T extends Record<string, Factory<any>>>(
  factoriesOrBuilder: T | ((factories: T) => T)
): T

export interface BatchMethods {
  defineFactories: typeof defineFactories
}

export const batch: {
  name: "batch"
  apply(container: Container, internals: any): BatchMethods
}
