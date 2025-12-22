// ═══════════════════════════════════════════════════════════════════
// INPUT TYPES
// ═══════════════════════════════════════════════════════════════════

export interface DiscoverOptions {
  /** Files to analyze: glob patterns or Record of filename to code */
  files: string[] | Record<string, string>

  /** Level 2: Custom parse function. If both parse and ast provided, ast wins. */
  parse?: (code: string, filename: string) => FileAnalysis | Promise<FileAnalysis>

  /** Level 3: Provide AST. Takes precedence over parse. */
  ast?: (code: string, filename: string) => unknown | Promise<unknown>

  /** Level 3: Custom walker for non-ESTree ASTs */
  walk?: (ast: unknown, visitor: (node: unknown) => void) => void

  /** Level 3: Pattern matchers to use */
  patterns?: Pattern[]

  /** Enable caching for watch mode */
  cache?: boolean | Cache

  /** Base directory for resolving relative paths */
  cwd?: string

  /** Maximum depth for following re-export chains. Default: 3 */
  maxReexportDepth?: number
}

// ═══════════════════════════════════════════════════════════════════
// PER-FILE ANALYSIS TYPES
// ═══════════════════════════════════════════════════════════════════

export interface FileAnalysis {
  factories: FactoryInfo[]
  exports: ExportInfo[]
  imports: ImportInfo[]
  errors?: ParseError[]
}

export interface FactoryInfo {
  name: string
  type: "factory" | "inject" | "anonymous" | "custom"
  file: string
  line: number
  column?: number
  deps: DependencyRef[]
  options?: FactoryOptions
  localName?: string
}

export interface DependencyRef {
  name: string | null
  type: "direct" | "lazy" | "dynamic"
  dynamicExpr?: string
  resolvedName?: string
  resolvedFile?: string
}

export interface FactoryOptions {
  transient?: boolean
  timeout?: number
  async?: boolean
}

export interface ExportInfo {
  localName: string
  exportedAs: string
  file: string
  reexport?: boolean
  sourceModule?: string
  wildcard?: boolean
}

export interface ImportInfo {
  localName: string
  importedName: string
  source: string
  namespace?: boolean
  default?: boolean
  file: string
  line: number
}

export interface ParseError {
  file: string
  line?: number
  column?: number
  message: string
  fatal: boolean
}

// ═══════════════════════════════════════════════════════════════════
// PATTERN MATCHING TYPES (Level 3)
// ═══════════════════════════════════════════════════════════════════

export interface Pattern {
  name: string
  match: (node: unknown) => boolean
  extract: (node: unknown, helpers: PatternHelpers) => Partial<FactoryInfo> | null
}

export interface PatternHelpers {
  getStringValue: (node: unknown) => string | null
  findDepsInFunction: (fnNode: unknown) => DependencyRef[]
  isIdentifier: (node: unknown, name: string) => boolean
  isCallExpression: (node: unknown, calleeName: string) => boolean
  getLoc: (node: unknown) => { line: number; column?: number } | null
  getFilename: () => string
}

// ═══════════════════════════════════════════════════════════════════
// CACHE TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CacheEntry {
  contentHash: string
  optionsHash: string
  analysis: FileAnalysis
  timestamp: number
}

export interface Cache {
  get(filename: string, code: string): FileAnalysis | null
  set(filename: string, code: string, analysis: FileAnalysis): void
  invalidate(filename: string): void
  clear(): void
  stats(): { size: number; entries: string[] }
}

// ═══════════════════════════════════════════════════════════════════
// OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════════

export interface DiscoveryResult {
  factories: FactoryInfo[]
  dependencies: DependencyEdge[]
  exports: ExportInfo[]
  errors: ParseError[]

  getFactory(name: string): FactoryInfo | undefined
  getFactoriesInFile(filename: string): FactoryInfo[]
  getDependentsOf(name: string): FactoryInfo[]
  getDependenciesOf(name: string): FactoryInfo[]
  getExportedFactories(): FactoryInfo[]
  getTopologicalOrder(): FactoryInfo[]

  validate(): ValidationReport

  toMermaid(): string
  toDot(): string
  toJSON(): object
}

export interface DependencyEdge {
  from: string
  to: string
  type: "direct" | "lazy" | "dynamic"
  file: string
  line: number
  resolved?: boolean
}

export interface ValidationReport {
  valid: boolean
  missing: Array<{ name: string; referencedBy: string; file: string; line: number }>
  circular: string[][]
  private: FactoryInfo[]
  roots: FactoryInfo[]
  dynamic: Array<{ factory: string; expr: string; file: string; line: number }>
  external: Array<{ source: string; file: string; line: number }>
  outOfScope: Array<{ source: string; resolvedPath: string; file: string; line: number }>
}

// ═══════════════════════════════════════════════════════════════════
// MAIN API
// ═══════════════════════════════════════════════════════════════════

export function discover(options: DiscoverOptions): Promise<DiscoveryResult>
export function discover(files: string[]): Promise<DiscoveryResult>

export function createCache(options: DiscoverOptions): Cache

export function createDiscoveryResult(data: {
  factories: FactoryInfo[]
  dependencies: DependencyEdge[]
  exports: ExportInfo[]
  errors: ParseError[]
  external?: Array<{ source: string; file: string; line: number }>
  outOfScope?: Array<{ source: string; resolvedPath: string; file: string; line: number }>
}): DiscoveryResult

/** Level 1 string-based parser (no dependencies, simple string matching) */
export function parseString(code: string, filename: string): FileAnalysis

// ═══════════════════════════════════════════════════════════════════
// BUILT-IN PATTERNS
// ═══════════════════════════════════════════════════════════════════

export namespace patterns {
  export function factory(): Pattern
  export function inject(): Pattern
  export function custom(config: {
    name: string
    match: (node: unknown) => boolean
    extract: (node: unknown, helpers: PatternHelpers) => Partial<FactoryInfo> | null
  }): Pattern
}
