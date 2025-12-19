/**
 * A factory is a function that takes a container and returns a value.
 * The container caches the result, so factories are only called once (singleton).
 *
 * @example
 * const logger: Factory<Logger> = (c) => new Logger(c.get(config))
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
   *
   * @example
   * const logger = container.get(loggerFactory)
   * const same = container.get(loggerFactory)
   * console.log(logger === same) // true
   */
  get<T>(factory: Factory<T>): T
}

/**
 * Creates a new dependency injection container.
 *
 * The container caches factory results, so each factory only runs once (singleton pattern).
 * Factories declare dependencies by calling `c.get(otherFactory)`.
 *
 * @example
 * const config: Factory<Config> = () => new Config()
 * const logger: Factory<Logger> = (c) => new Logger(c.get(config))
 *
 * const container = createContainer()
 * const log = container.get(logger) // Logger with Config injected
 */
export function createContainer(): Container

/**
 * Creates a child container for request-scoped dependencies.
 *
 * Each child container has its own cache. Use this when you need per-request
 * isolation (e.g., HTTP requests) while sharing app-wide singletons.
 *
 * @example
 * const app = createContainer()
 *
 * function handleRequest(req: Request) {
 *   const requestScope = childContainer(app)
 *   const handler = requestScope.get(requestHandlerFactory)
 * }
 */
export function childContainer(parent: Container): Container

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
