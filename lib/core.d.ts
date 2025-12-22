/**
 * Core DI container types.
 * Import from 'no-decoration/core' for the minimal container.
 */

/**
 * Options for container creation.
 */
export interface ContainerOptions {
  /**
   * Detect circular dependencies and throw a helpful error.
   * @default true
   */
  detectCircular?: boolean

  /**
   * Interceptors wrap every resolution with additional behavior.
   * Each interceptor receives the factory and a `next` function.
   */
  interceptors?: Interceptor[]
}

/**
 * A factory is a function that takes a container and returns a value.
 * The container caches the result, so factories are only called once (singleton).
 */
export type Factory<T> = ((container: Container) => T) & {
  displayName?: string
  _transient?: boolean
  _inner?: Factory<unknown>  // unknown to support type-changing decorators (retry, transform, etc.)
}

/**
 * Interceptor function that wraps resolution.
 * Uses polymorphic function type to preserve type information through the chain.
 */
export type Interceptor = <T>(factory: Factory<T>, next: () => T) => T

/**
 * Read-only container interface
 */
export interface ReadOnlyContainer {
  get<T>(factory: Factory<T>): T
  tryGet<T>(factory: Factory<T>): T | undefined
  has<T>(factory: Factory<T>): boolean
  resolver<T>(factory: Factory<T>): () => T
}

/**
 * Lazy value wrapper
 */
export interface Lazy<T> {
  readonly value: T
}

/**
 * Internal state and hooks exposed to plugins.
 * Uses `unknown` for type-erased storage - plugins must handle values appropriately.
 */
export interface ContainerInternals {
  cache: Map<Factory<unknown>, unknown>
  overrides: Map<Factory<unknown>, Factory<unknown>>
  hooks: {
    beforeResolve: Array<(factory: Factory<unknown>) => void>
    afterResolve: Array<(factory: Factory<unknown>, value: unknown, ms: number) => void>
    onDispose: Array<(factory: Factory<unknown>) => void>
    onOverride: Array<(original: Factory<unknown>, replacement: Factory<unknown>) => void>
  }
  resolutionStack: Factory<unknown>[]
  parent: Container | undefined
}

/**
 * A plugin that can be applied to a container to add functionality.
 */
export interface Plugin<T extends object = object> {
  name: string
  apply(container: Container, internals: ContainerInternals): T
}

/**
 * Core dependency injection container.
 * Use .with(plugin) to add functionality.
 */
export interface Container {
  // === Core Resolution ===

  /**
   * Get or create an instance from a factory.
   * Results are cached - calling get() twice with the same factory returns the same instance.
   */
  get<T>(factory: Factory<T>): T

  /**
   * Check if a factory has been resolved (exists in cache or parent).
   */
  has<T>(factory: Factory<T>): boolean

  /**
   * Get a resolver function that resolves through the container.
   */
  resolver<T>(factory: Factory<T>): () => T

  // === Lifecycle ===

  /**
   * Register a cleanup function to be called on dispose().
   */
  onDispose(fn: () => void | Promise<void>): void

  /**
   * Dispose the container, calling all registered cleanup functions.
   */
  dispose(): Promise<void>

  // === Testing Support (Core) ===

  /**
   * Try to resolve a factory, returning undefined if it fails.
   */
  tryGet<T>(factory: Factory<T>): T | undefined

  /**
   * Override a factory with a replacement for testing.
   */
  override<T>(factory: Factory<T>, replacement: Factory<T>): void

  /**
   * Clear all overrides.
   */
  clearOverrides(): void

  /**
   * Clear the resolution cache (without disposing).
   */
  clearCache(): void

  // === Production Reliability ===

  /**
   * Freeze the container - no new resolutions allowed.
   */
  freeze(): void

  /**
   * Pre-resolve factories so child containers share the cached instances.
   * Call this at startup before creating any child containers.
   *
   * @example
   * ```ts
   * const app = createContainer()
   * await app.warmup([database, userService, cache])
   * // Now child containers will share these singletons
   * ```
   */
  warmup(factories: Factory<unknown>[]): Promise<this>

  /**
   * Get a read-only view of the container.
   */
  asReadOnly(): ReadOnlyContainer

  // === Plugin System ===

  /**
   * Apply a plugin to this container.
   * Returns the container with the plugin's methods added.
   */
  with<T extends object>(plugin: Plugin<T>): this & T
}

/**
 * Creates a new core dependency injection container.
 * Use .with(plugin) to add functionality like health checks, observability, etc.
 */
export declare function createContainer(options?: ContainerOptions): Container

/**
 * Creates a child container for request-scoped dependencies.
 * Supports `await using` for automatic cleanup.
 */
export declare function childContainer(
  parent: Container,
  options?: ContainerOptions
): Container & { [Symbol.asyncDispose](): Promise<void> }

// === Helper Functions ===

// Helper type to extract the return type of a Factory
type FactoryReturnType<F> = F extends Factory<infer R> ? R : never

/**
 * Create a factory that constructs a class or calls a function with dependencies.
 */
// 0 dependencies
export declare function inject<T>(Class: new () => T): Factory<T>
export declare function inject<T>(fn: () => T): Factory<T>

// 1 dependency
export declare function inject<T, A>(
  Class: new (a: A) => T,
  depA: Factory<A>
): Factory<T>
export declare function inject<T, A>(
  fn: (a: A) => T,
  depA: Factory<A>
): Factory<T>

// 2 dependencies
export declare function inject<T, A, B>(
  Class: new (a: A, b: B) => T,
  depA: Factory<A>,
  depB: Factory<B>
): Factory<T>
export declare function inject<T, A, B>(
  fn: (a: A, b: B) => T,
  depA: Factory<A>,
  depB: Factory<B>
): Factory<T>

// 3 dependencies
export declare function inject<T, A, B, C>(
  Class: new (a: A, b: B, c: C) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>
): Factory<T>
export declare function inject<T, A, B, C>(
  fn: (a: A, b: B, c: C) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>
): Factory<T>

// 4 dependencies
export declare function inject<T, A, B, C, D>(
  Class: new (a: A, b: B, c: C, d: D) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>,
  depD: Factory<D>
): Factory<T>
export declare function inject<T, A, B, C, D>(
  fn: (a: A, b: B, c: C, d: D) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>,
  depD: Factory<D>
): Factory<T>

// 5 dependencies
export declare function inject<T, A, B, C, D, E>(
  Class: new (a: A, b: B, c: C, d: D, e: E) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>,
  depD: Factory<D>,
  depE: Factory<E>
): Factory<T>
export declare function inject<T, A, B, C, D, E>(
  fn: (a: A, b: B, c: C, d: D, e: E) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>,
  depD: Factory<D>,
  depE: Factory<E>
): Factory<T>

// 6 dependencies
export declare function inject<T, A, B, C, D, E, F>(
  Class: new (a: A, b: B, c: C, d: D, e: E, f: F) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>,
  depD: Factory<D>,
  depE: Factory<E>,
  depF: Factory<F>
): Factory<T>
export declare function inject<T, A, B, C, D, E, F>(
  fn: (a: A, b: B, c: C, d: D, e: E, f: F) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>,
  depD: Factory<D>,
  depE: Factory<E>,
  depF: Factory<F>
): Factory<T>

// 7 dependencies
export declare function inject<T, A, B, C, D, E, F, G>(
  Class: new (a: A, b: B, c: C, d: D, e: E, f: F, g: G) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>,
  depD: Factory<D>,
  depE: Factory<E>,
  depF: Factory<F>,
  depG: Factory<G>
): Factory<T>
export declare function inject<T, A, B, C, D, E, F, G>(
  fn: (a: A, b: B, c: C, d: D, e: E, f: F, g: G) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>,
  depD: Factory<D>,
  depE: Factory<E>,
  depF: Factory<F>,
  depG: Factory<G>
): Factory<T>

// 8 dependencies
export declare function inject<T, A, B, C, D, E, F, G, H>(
  Class: new (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>,
  depD: Factory<D>,
  depE: Factory<E>,
  depF: Factory<F>,
  depG: Factory<G>,
  depH: Factory<H>
): Factory<T>
export declare function inject<T, A, B, C, D, E, F, G, H>(
  fn: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H) => T,
  depA: Factory<A>,
  depB: Factory<B>,
  depC: Factory<C>,
  depD: Factory<D>,
  depE: Factory<E>,
  depF: Factory<F>,
  depG: Factory<G>,
  depH: Factory<H>
): Factory<T>

// Fallback for 9+ dependencies
export declare function inject<T, Deps extends readonly Factory<unknown>[]>(
  Class: new (...args: { [K in keyof Deps]: FactoryReturnType<Deps[K]> }) => T,
  ...dependencies: Deps
): Factory<T>
export declare function inject<T, Deps extends readonly Factory<unknown>[]>(
  fn: (...args: { [K in keyof Deps]: FactoryReturnType<Deps[K]> }) => T,
  ...dependencies: Deps
): Factory<T>

/**
 * Mark a factory as transient - creates a new instance every time.
 */
export declare function transient<T>(factory: Factory<T>): Factory<T>

/**
 * Create a lazy wrapper that defers resolution until .value is accessed.
 */
export declare function lazy<T>(container: Container, factory: Factory<T>): Lazy<T>

/**
 * Give a factory a display name for better error messages.
 */
export declare function named<T>(name: string, factory: Factory<T>): Factory<T>

/**
 * Options for the factory() helper.
 */
export interface FactoryOptions {
  /**
   * Create a new instance every time (default: false = singleton).
   */
  transient?: boolean

  /**
   * Timeout in milliseconds for async factories.
   */
  timeout?: number
}

/**
 * Create a factory with common options in one call.
 * This is the recommended way to define factories.
 *
 * @example
 * const db = factory("Database", async (c) => new Database(c.get(config)))
 * const command = factory("Command", () => new Command(), { transient: true })
 * const slowService = factory("SlowService", async (c) => {...}, { timeout: 5000 })
 */
export declare function factory<T>(
  name: string,
  fn: (container: Container) => T,
  options?: FactoryOptions
): Factory<T>

/**
 * Create a factory with timeout - return type is always Promise.
 */
export declare function factory<T>(
  name: string,
  fn: (container: Container) => T | Promise<T>,
  options: FactoryOptions & { timeout: number }
): Factory<Promise<T>>


/**
 * Wrap a factory with a timeout.
 */
export declare function timeout<T>(
  factory: Factory<T | Promise<T>>,
  ms: number
): Factory<Promise<T>>

/**
 * Create a factory namespace for multiple tagged implementations.
 */
export declare function tagged<T>(
  namespace: string,
  factoryCreator: (tag: string) => Factory<T>
): (tag: string) => Factory<T>

/**
 * Wrap a factory's output with additional behavior.
 */
export declare function wrap<T>(
  factory: Factory<T>,
  wrapper: (instance: T) => T
): Factory<T>

/**
 * Create a scoped factory that captures request-specific parameters.
 * The creator receives the container as the first argument.
 */
export declare function scoped<Args extends unknown[], T>(
  creator: (container: Container, ...args: Args) => T
): (...args: Args) => Factory<T>

/**
 * Compose multiple plugins into a single plugin.
 */
// 1 plugin
export declare function pipe<A extends object>(p1: Plugin<A>): Plugin<A>

// 2 plugins
export declare function pipe<A extends object, B extends object>(
  p1: Plugin<A>,
  p2: Plugin<B>
): Plugin<A & B>

// 3 plugins
export declare function pipe<A extends object, B extends object, C extends object>(
  p1: Plugin<A>,
  p2: Plugin<B>,
  p3: Plugin<C>
): Plugin<A & B & C>

// 4 plugins
export declare function pipe<
  A extends object,
  B extends object,
  C extends object,
  D extends object
>(p1: Plugin<A>, p2: Plugin<B>, p3: Plugin<C>, p4: Plugin<D>): Plugin<A & B & C & D>

// 5 plugins
export declare function pipe<
  A extends object,
  B extends object,
  C extends object,
  D extends object,
  E extends object
>(
  p1: Plugin<A>,
  p2: Plugin<B>,
  p3: Plugin<C>,
  p4: Plugin<D>,
  p5: Plugin<E>
): Plugin<A & B & C & D & E>

// 6 plugins
export declare function pipe<
  A extends object,
  B extends object,
  C extends object,
  D extends object,
  E extends object,
  F extends object
>(
  p1: Plugin<A>,
  p2: Plugin<B>,
  p3: Plugin<C>,
  p4: Plugin<D>,
  p5: Plugin<E>,
  p6: Plugin<F>
): Plugin<A & B & C & D & E & F>

// 7 plugins
export declare function pipe<
  A extends object,
  B extends object,
  C extends object,
  D extends object,
  E extends object,
  F extends object,
  G extends object
>(
  p1: Plugin<A>,
  p2: Plugin<B>,
  p3: Plugin<C>,
  p4: Plugin<D>,
  p5: Plugin<E>,
  p6: Plugin<F>,
  p7: Plugin<G>
): Plugin<A & B & C & D & E & F & G>

// 8 plugins
export declare function pipe<
  A extends object,
  B extends object,
  C extends object,
  D extends object,
  E extends object,
  F extends object,
  G extends object,
  H extends object
>(
  p1: Plugin<A>,
  p2: Plugin<B>,
  p3: Plugin<C>,
  p4: Plugin<D>,
  p5: Plugin<E>,
  p6: Plugin<F>,
  p7: Plugin<G>,
  p8: Plugin<H>
): Plugin<A & B & C & D & E & F & G & H>

// Fallback for 9+ plugins (loses precise intersection typing)
export declare function pipe<P extends Plugin<object>[]>(
  ...plugins: P
): Plugin<UnionToIntersection<PluginReturnType<P[number]>> & object>

/**
 * Helper to create a plugin with a name and apply function.
 */
export declare function definePlugin<T extends object>(
  name: string,
  apply: (container: Container, internals: ContainerInternals) => T
): Plugin<T>

// Helper types for plugin composition
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never

type PluginReturnType<P> = P extends Plugin<infer T> ? T : never
