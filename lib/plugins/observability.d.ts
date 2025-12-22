import { Container, Factory, Plugin } from "../core.js"

export type ResolveHandler = (
  factory: Factory<any>,
  instance: any,
  ms: number
) => void
export type DisposeHandler = (factory: Factory<any>) => void
export type OverrideHandler = (
  original: Factory<any>,
  replacement: Factory<any>
) => void

export interface ResolutionContext {
  parent: Factory<any> | null
  depth: number
}

export interface DependencyGraph {
  edges: Map<Factory<any>, Set<Factory<any>>>
  toMermaid(): string
  getTopologicalOrder(): Factory<any>[]
}

export interface ValidationError {
  factory: string
  error: Error
}

export interface ValidationReport {
  valid: boolean
  errors: ValidationError[]
}

export interface ObservabilityMethods {
  on(event: "resolve", handler: ResolveHandler): () => void
  on(event: "dispose", handler: DisposeHandler): () => void
  on(event: "override", handler: OverrideHandler): () => void
  validate(factories: Factory<any>[]): Promise<void>
  validateReport(factories: Factory<any>[]): Promise<ValidationReport>
  getResolutionContext(): ResolutionContext
  getDependencyGraph(): DependencyGraph
}

export const observability: Plugin<ObservabilityMethods>
