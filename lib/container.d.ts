/**
 * Options for container creation.
 */
export interface ContainerOptions {
  /**
   * Detect circular dependencies and throw a helpful error.
   * @default true
   */
  detectCircular?: boolean
}

/**
 * A factory is a function that takes a container and returns a value.
 * The container caches the result, so factories are only called once (singleton).
 *
 * @example
 * const logger: Factory<Logger> = (c) => new Logger(c.get(config))
 *
 * // Async factories work too
 * const db: Factory<Promise<Database>> = async (c) => await Database.connect()
 */
export type Factory<T> = (container: Container) => T

/**
 * A dependency injection container that caches factory results.
 *
 * @example
 * const container = createContainer()
 * const logger = container.get(loggerFactory) // Logger instance, cached
 */
export interface Container {
  /**
   * Get or create an instance from a factory.
   * Results are cached - calling get() twice with the same factory returns the same instance.
   * Automatically handles async factories.
   *
   * @example
   * const logger = container.get(loggerFactory)
   * const db = await container.get(asyncDbFactory)
   */
  get<T>(factory: Factory<T>): T

  /**
   * Register a cleanup function to be called on dispose().
   * Cleanup functions are called in reverse order (LIFO).
   *
   * @example
   * container.onDispose(() => db.close())
   * container.onDispose(async () => await server.stop())
   */
  onDispose(fn: () => void | Promise<void>): void

  /**
   * Dispose the container, calling all registered cleanup functions.
   * Clears the cache after disposal.
   *
   * @example
   * await container.dispose()
   */
  dispose(): Promise<void>

  /**
   * Check if a factory has been resolved (exists in cache or parent).
   * Used internally by child containers.
   */
  has<T>(factory: Factory<T>): boolean
}

/**
 * Creates a new dependency injection container.
 *
 * Features:
 * - Automatic caching (singleton pattern)
 * - Async factory support
 * - Circular dependency detection (on by default)
 * - Disposal/cleanup support
 *
 * @example
 * const container = createContainer()
 *
 * // Opt out of circular detection for performance
 * const container = createContainer({ detectCircular: false })
 */
export function createContainer(options?: ContainerOptions): Container

/**
 * Creates a child container for request-scoped dependencies.
 *
 * Each child container has its own cache and disposal. Use this when you need
 * per-request isolation (e.g., HTTP requests) while sharing app-wide singletons.
 *
 * @example
 * const app = createContainer()
 *
 * function handleRequest(req: Request) {
 *   const request = childContainer(app)
 *   try {
 *     const handler = request.get(requestHandlerFactory)
 *     return handler.handle()
 *   } finally {
 *     await request.dispose()
 *   }
 * }
 */
export function childContainer(
  parent: Container,
  options?: ContainerOptions
): Container

/**
 * Optional helper to create a factory that constructs a class with dependencies.
 *
 * This is pure convenience - these are exactly equivalent:
 * ```ts
 * const logger = inject(Logger, config)
 * const logger: Factory<Logger> = (c) => new Logger(c.get(config))
 * ```
 *
 * The explicit version is more flexible (supports conditionals, defaults, etc).
 *
 * @example
 * class UserService {
 *   constructor(private db: Database, private logger: Logger) {}
 * }
 *
 * const userService = inject(UserService, database, logger)
 */
export function inject<T>(
  Class: new (...args: any[]) => T,
  ...dependencies: Factory<any>[]
): Factory<T>
