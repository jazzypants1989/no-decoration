# Discovery Plugin

Scan your codebase to discover factory definitions, their dependencies, and generate dependency graphs.

## Quick Start

```js
import { discover } from 'no-decoration/plugins'

// Scan a directory
const result = await discover(['./src'])

console.log(result.factories)           // All discovered factories
console.log(result.dependencies)        // Dependency edges
console.log(result.toMermaid())         // Mermaid diagram
console.log(result.validate())          // Validation report
```

## Three-Level API

The discovery plugin uses a "bring your own parser" design with three levels of increasing power:

### Level 1: Zero Configuration (Default)

Works out of the box with no dependencies. Uses simple string matching to find common patterns.

```js
const result = await discover(['src/**/*.js'])
```

**What it detects:**
- `factory("Name", ...)` and `named("Name", ...)` calls
- `inject(ClassName, ...)` calls
- `c.get(identifier)` and `container.get(identifier)` for dependencies
- `lazy(c, identifier)` for lazy dependencies
- Import/export statements for cross-file resolution

**Limitations:**
- May miss unusual formatting
- Can't handle dynamic names: `factory(\`${prefix}Service\`, ...)`

### Level 2: Custom Parser

Provide your own `parse()` function for full control:

```js
import * as ts from 'typescript'

const result = await discover({
  files: ['src/**/*.ts'],
  parse: (code, filename) => {
    const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true)

    // Your detection logic here
    const factories = []
    const imports = []
    const exports = []

    // Walk the AST and extract what you need...

    return { factories, imports, exports }
  }
})
```

### Level 3: AST + Pluggable Patterns

Let discovery handle the walking, you provide the AST and patterns:

```js
import * as acorn from 'acorn'
import { discover, patterns } from 'no-decoration/plugins'

const result = await discover({
  files: ['src/**/*.js'],

  // Provide the AST
  ast: (code, filename) => acorn.parse(code, {
    ecmaVersion: 2024,
    sourceType: 'module',
    locations: true
  }),

  // Use built-in + custom patterns
  patterns: [
    patterns.factory(),
    patterns.inject(),

    // Custom pattern for your codebase
    patterns.custom({
      name: 'createService',
      match: (node) =>
        node.type === 'CallExpression' &&
        node.callee?.name?.startsWith('create'),
      extract: (node, helpers) => ({
        name: helpers.getStringValue(node.arguments[0]),
        deps: helpers.findDepsInFunction(node.arguments[1])
      })
    })
  ]
})
```

**For non-ESTree ASTs (TypeScript):**

```js
import * as ts from 'typescript'

const result = await discover({
  files: ['src/**/*.ts'],

  ast: (code, filename) =>
    ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true),

  // Custom walker for TypeScript AST
  walk: (ast, visitor) => {
    function visit(node) {
      visitor(node)
      ts.forEachChild(node, visit)
    }
    visit(ast)
  },

  // Patterns written for TypeScript AST
  patterns: [{
    name: 'factory',
    match: (node) =>
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'factory',
    extract: (node, helpers) => ({
      name: node.arguments[0]?.getText(),
      // ... TypeScript-specific extraction
    })
  }]
})
```

## Virtual Files (Testing)

Pass code directly instead of file paths - perfect for testing:

```js
const result = await discover({
  files: {
    'db.js': `export const db = factory("Database", () => new DB())`,
    'service.js': `
      import { db } from './db.js'
      export const svc = factory("Service", c => c.get(db))
    `
  }
})

// Dependencies are resolved across virtual files
result.dependencies
// [{ from: 'Service', to: 'Database', type: 'direct', ... }]
```

## Cross-File Resolution

The discovery plugin automatically resolves imports to find the actual factory names:

```js
// factories.js
export const db = factory("Database", () => new DB())

// service.js
import { db } from './factories.js'
export const svc = factory("Service", c => c.get(db))
//                                            ^^ identifier "db"
```

The dependency edge will be `Service → Database` (factory names), not `Service → db` (identifier names).

### Barrel File Support

Re-exports are followed up to `maxReexportDepth` (default: 3):

```js
// db.js
export const db = factory("Database", () => new DB())

// index.js (barrel)
export * from './db.js'

// service.js
import { db } from './index.js'  // Resolved through the barrel
```

## Result Object

### Properties

```ts
interface DiscoveryResult {
  factories: FactoryInfo[]      // All discovered factories
  dependencies: DependencyEdge[] // All dependency edges
  exports: ExportInfo[]         // All exports found
  errors: ParseError[]          // Any parse errors
}
```

### Query Methods

```js
const result = await discover(['src/**/*.js'])

// Get a specific factory
result.getFactory('UserService')

// Get all factories in a file
result.getFactoriesInFile('src/services/user.js')

// Get factories that depend on Database
result.getDependentsOf('Database')

// Get what UserService depends on
result.getDependenciesOf('UserService')

// Get only exported factories
result.getExportedFactories()

// Get factories in dependency order (leaves first)
result.getTopologicalOrder()
```

### Validation

```js
const report = result.validate()

report.valid      // true if no missing deps or cycles
report.missing    // Dependencies not found in analyzed files
report.circular   // Circular dependency chains: [['A', 'B', 'A']]
report.private    // Factories not exported (internal)
report.roots      // Entry points (exported, nothing depends on them)
report.dynamic    // Dependencies that couldn't be statically resolved
report.external   // Imports from node_modules
report.outOfScope // Imports from files not in the glob pattern
```

### Output Formats

```js
// Mermaid diagram
result.toMermaid()
// graph TD
//     Database["Database"]
//     UserService["UserService (async)"]
//     UserService --> Database

// Graphviz DOT
result.toDot()
// digraph DependencyGraph {
//     rankdir=TB;
//     "Database";
//     "UserService" [style=dashed];
//     "UserService" -> "Database";
// }

// JSON export
result.toJSON()
// { version: "1.0", factories: [...], dependencies: [...], validation: {...} }
```

## Options

```ts
interface DiscoverOptions {
  // Required: files to analyze
  files: string[] | Record<string, string>

  // Level 2: Custom parser
  parse?: (code: string, filename: string) => FileAnalysis | Promise<FileAnalysis>

  // Level 3: AST provider
  ast?: (code: string, filename: string) => unknown | Promise<unknown>

  // Level 3: Custom walker (for non-ESTree ASTs)
  walk?: (ast: unknown, visitor: (node: unknown) => void) => void

  // Level 3: Pattern matchers
  patterns?: Pattern[]

  // Enable caching for watch mode
  cache?: boolean | Cache

  // Base directory for resolving paths
  cwd?: string

  // Max depth for re-export chains (default: 3)
  maxReexportDepth?: number
}
```

## Caching

Enable caching for watch mode or repeated scans:

```js
const result = await discover({
  files: ['src/**/*.js'],
  cache: true  // Uses internal cache with content + options hashing
})
```

Or bring your own cache:

```js
import { createCache } from 'no-decoration/plugins'

const cache = createCache({ /* options */ })

// First scan
const result1 = await discover({ files: ['src/**/*.js'], cache })

// Second scan - uses cache for unchanged files
const result2 = await discover({ files: ['src/**/*.js'], cache })

// Invalidate specific file
cache.invalidate('src/changed.js')

// Clear all
cache.clear()
```

## Type Definitions

### FactoryInfo

```ts
interface FactoryInfo {
  name: string                    // Factory name from factory("Name", ...)
  type: 'factory' | 'inject' | 'anonymous' | 'custom'
  file: string                    // Source file path
  line: number                    // Line number (1-indexed)
  column?: number                 // Column number (0-indexed)
  deps: DependencyRef[]           // Dependencies
  options?: {
    transient?: boolean
    timeout?: number
    async?: boolean
  }
  localName?: string              // Variable name if different from factory name
}
```

### DependencyRef

```ts
interface DependencyRef {
  name: string | null             // null for dynamic dependencies
  type: 'direct' | 'lazy' | 'dynamic'
  dynamicExpr?: string            // For dynamic: the expression that couldn't be resolved
  resolvedName?: string           // The actual factory name after resolution
  resolvedFile?: string           // Where the factory is defined
}
```

### DependencyEdge

```ts
interface DependencyEdge {
  from: string        // Factory name
  to: string          // Dependency name (resolved if possible)
  type: 'direct' | 'lazy' | 'dynamic'
  file: string        // Where the dependency is declared
  line: number
  resolved?: boolean  // Whether cross-file resolution succeeded
}
```

## Usage Patterns

### Documentation Generation

```js
import { discover } from 'no-decoration/plugins'
import { writeFileSync } from 'fs'

const result = await discover(['src/**/*.js'])

const doc = `# Dependency Graph

## Factories

${result.factories.map(f =>
  `- **${f.name}** (${f.file}:${f.line})${f.options?.async ? ' [async]' : ''}`
).join('\n')}

## Graph

\`\`\`mermaid
${result.toMermaid()}
\`\`\`
`

writeFileSync('docs/dependencies.md', doc)
```

### CI Validation

```js
import { discover } from 'no-decoration/plugins'

const result = await discover(['src/**/*.js'])
const report = result.validate()

if (!report.valid) {
  console.error('Dependency issues found:')

  for (const missing of report.missing) {
    console.error(`  ${missing.referencedBy} → ${missing.name} (not found)`)
  }

  for (const cycle of report.circular) {
    console.error(`  Circular: ${cycle.join(' → ')}`)
  }

  process.exit(1)
}

console.log('Dependency graph valid!')
console.log(`  ${result.factories.length} factories`)
console.log(`  ${report.roots.length} entry points`)
```

### Finding Entry Points

```js
const result = await discover(['src/**/*.js'])
const { roots } = result.validate()

console.log('Application entry points:')
for (const factory of roots) {
  console.log(`  ${factory.name} (${factory.file})`)
}
```

### Detecting Async Factory Chains

```js
const result = await discover(['src/**/*.js'])

const asyncFactories = result.factories.filter(f => f.options?.async)

for (const factory of asyncFactories) {
  console.log(`${factory.name} is async`)

  // Find what depends on this async factory
  const dependents = result.getDependentsOf(factory.name)
  if (dependents.length > 0) {
    console.log(`  Used by: ${dependents.map(d => d.name).join(', ')}`)
  }
}
```

## Implementation Notes

The built-in Level 1 parser uses **pure string manipulation** (no regex, no AST). This is intentional:

1. **Zero dependencies** - Works out of the box
2. **Easy to understand** - Just `indexOf`, `slice`, and character walking
3. **Extensible** - Clear patterns to follow for custom parsers

For production codebases with complex patterns, use Level 2 or Level 3 with a real parser like `acorn`, `@babel/parser`, or the TypeScript compiler.

## See Also

- [observability](./observability.md) - Runtime dependency graph via `getDependencyGraph()`
- [testing](./testing.md) - Mock factories for testing
