/**
 * Internal type declarations for no-decoration/core
 * @module no-decoration/internal
 * @internal This module is not part of the public API
 */

import type { Container, ContainerOptions } from "./core.js"

/**
 * Creates a container with optional parent for inheritance.
 * This is the internal implementation used by both createContainer and childContainer.
 *
 * @param parent - Optional parent container for hierarchical resolution
 * @param options - Container configuration options
 * @returns A configured container instance
 */
export declare function createContainerInternal(
  parent: Container | undefined,
  options?: ContainerOptions
): Container
