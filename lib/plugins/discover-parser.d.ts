/**
 * Parser utilities for factory discovery.
 *
 * This module provides simple string-based parsing for discovering factory definitions.
 * For production use with complex codebases, consider using a real parser like acorn.
 */

/**
 * String manipulation helpers for parsing.
 */
export interface StringHelpers {
  /**
   * Skip whitespace characters from position.
   * @param str - The string to search in
   * @param pos - Starting position
   * @returns Position after whitespace
   */
  skipWhitespace(str: string, pos: number): number

  /**
   * Find closing bracket accounting for nesting.
   * @param str - The string to search in
   * @param openPos - Position of opening bracket
   * @param openChar - Opening bracket character (default: "{")
   * @param closeChar - Closing bracket character (default: "}")
   * @returns Position of closing bracket or -1 if not found
   */
  findBalancedClose(
    str: string,
    openPos: number,
    openChar?: string,
    closeChar?: string
  ): number

  /**
   * Extract content between quotes starting from position.
   * @param str - The string to search in
   * @param startPos - Starting position
   * @returns Extracted value and end position, or null if not found
   */
  extractQuoted(
    str: string,
    startPos: number
  ): { value: string; endPos: number } | null

  /**
   * Check if character is a valid identifier character.
   * @param c - Character to check
   * @returns True if valid identifier character
   */
  isIdentChar(c: string): boolean

  /**
   * Extract identifier (word) starting from position.
   * @param str - The string to search in
   * @param startPos - Starting position
   * @returns Extracted identifier and end position, or null if not found
   */
  extractIdentifier(
    str: string,
    startPos: number
  ): { value: string; endPos: number } | null
}

export const StringHelpers: StringHelpers

/**
 * A discovered factory definition.
 */
export interface DiscoveredFactory {
  /** Factory name (from factory("Name", ...) or variable name) */
  name: string
  /** File path where factory was found */
  file: string
  /** How the factory was detected (e.g., "factory()", "Factory<T>") */
  type: string
  /** Whether the factory is async */
  async: boolean
}

/**
 * An import statement.
 */
export interface ImportInfo {
  /** Imported names */
  names: string[]
  /** Import source path */
  source: string
}

/**
 * Find factory("Name", ...) or named("Name", ...) calls in source code.
 * @param content - Source code content
 * @param filePath - Path to the source file
 * @param functionName - Function name to search for (e.g., "factory", "named")
 * @returns Array of discovered factories
 */
export function findFunctionCalls(
  content: string,
  filePath: string,
  functionName: string
): DiscoveredFactory[]

/**
 * Find JSDoc Factory type annotations.
 * Looks for patterns like: \@type {Factory<T>}
 * @param content - Source code content
 * @param filePath - Path to the source file
 * @returns Array of discovered factories
 */
export function findFactoryJSDoc(
  content: string,
  filePath: string
): DiscoveredFactory[]

/**
 * Find import { ... } from "./..." statements.
 * Only finds relative imports (starting with ./ or ../)
 * @param content - Source code content
 * @returns Array of import info
 */
export function findImports(content: string): ImportInfo[]
