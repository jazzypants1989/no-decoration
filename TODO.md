# Future Improvements

## Target Audiences

1. **Novices** learning about DI concepts
2. **Skeptics** who think DI is enterprise cruft
3. **Experts** evaluating alternatives to decorator-based DI

## Success Criteria

> "Huh. This is just functions. Why did we ever need decorators for this?"

## Guiding Principles

**Core budget: ~1,000 lines max.** Currently at ~540 (core + errors).

Before adding anything, ask:
1. Does it add magic? → Don't add it
2. Can it be a plugin? → Make it a plugin
3. Does it strengthen the thesis? → Decorators are unnecessary
4. Is it explicit? → Implicit is the enemy
5. Can you debug it? → Users should step through everything

---

## Priority 1: Interactive Website

**Vision:** Progressive learning experience where users can:
1. See the problem (code without DI)
2. See the solution (same code with DI)
3. Run it themselves (embedded playground)
4. Explore further (linked docs)

**Tasks:**
- [ ] Choose framework (Astro? VitePress?)
- [ ] Design learning path (Why DI → First Container → Testing → Async → Plugins → TypeScript)
- [ ] Embed runnable examples
- [ ] Interactive decorator vs explicit comparison
- [ ] Deploy to GitHub Pages

---

## Priority 2: Benchmarks

**Rationale:** Claims of "no overhead" should be backed by data.

**Tasks:**
- [ ] Resolution speed (direct vs `container.get()`, singleton vs transient, deep chains)
- [ ] Memory usage (container overhead, cache growth)
- [ ] Comparison with tsyringe, inversify, TypeDI
- [ ] Add results to README

---

## Maybe Someday

**Decorators Compatibility Layer** - Bridge for NestJS migration. Low priority, may undermine thesis.

**Performance Mode** - Skip safety checks for hot paths. Measure first.

---

## Completed

- Core library (~400 lines)
- Plugin system (health, observability, testing, debug, batch, discovery)
- Patterns plugin (guards, validation, interceptors, retry, timeout)
- TypeScript support via JSDoc
- 313 tests passing
- Full documentation suite
- API stabilization:
  - `getFactory()` → `resolver()`
  - `decorator()` → `wrap()`
  - `scoped()` + `scopedWith()` → unified `scoped()`
  - `createScope()` merged into `childContainer()`
- Resilience plugins:
  - `circuit-breaker` - Fail fast with CLOSED/OPEN/HALF_OPEN states
  - `cache` - TTL-based caching (ttlCache, slidingCache, refreshAhead, keyedCache)
- Observability plugins:
  - `metrics` - Prometheus-style counters, histograms, gauges
  - `tracing` - OpenTelemetry-style spans with Jaeger/Zipkin export
- Updated presets:
  - `production` now includes metrics
  - `development` now includes debug
- Documentation restructured:
  - Split `docs/plugins.md` into `docs/plugins/` directory
  - Individual docs for each plugin
- Discovery plugin rewrite:
  - Three-level API (zero-config → custom parser → AST + patterns)
  - Cross-file import/export resolution
  - Barrel file support with configurable depth
  - Virtual files for testing
  - Regex-free string parser (pure indexOf/slice)
  - Rich output with query methods and validation
