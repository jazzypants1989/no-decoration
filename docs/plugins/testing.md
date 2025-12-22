# Testing Plugin

Mocking, snapshots, and test isolation utilities.

## Import

```ts
import { testing } from 'no-decoration/plugins'
```

## Setup

```ts
import { createContainer } from 'no-decoration'
import { testing } from 'no-decoration/plugins'

const container = createContainer().with(testing)
```

## API

### withMocks(mocks)

Create a child container with mocked factories.

```ts
const testContainer = container.withMocks([
  [database, () => mockDatabase],
  [emailService, () => mockEmailService],
  [logger, () => ({ log: jest.fn() })]
])

// Mocks are isolated to this container
const userService = testContainer.get(userServiceFactory)
```

**Parameters:**

```ts
withMocks(mocks: Array<[Factory<T>, Factory<T>]>): Container
```

### snapshot()

Capture the current container state.

```ts
const snap = container.snapshot()
```

**Returns:**

```ts
interface ContainerSnapshot {
  cache: Map<Factory<unknown>, unknown>
  overrides: Map<Factory<unknown>, Factory<unknown>>
}
```

### restore(snapshot)

Restore the container to a previous snapshot.

```ts
// Save state before test
const snap = container.snapshot()

// Test modifies container...
container.override(database, mockDatabase)
container.get(someFactory)

// Restore original state
container.restore(snap)
```

## Usage Patterns

### Test Isolation

```ts
describe('UserService', () => {
  let testContainer

  beforeEach(() => {
    testContainer = container.withMocks([
      [database, () => createMockDatabase()],
      [logger, () => ({ log: jest.fn() })]
    ])
  })

  afterEach(async () => {
    await testContainer.dispose()
  })

  it('creates a user', async () => {
    const userService = testContainer.get(userServiceFactory)
    const user = await userService.create({ name: 'Alice' })
    expect(user.name).toBe('Alice')
  })
})
```

### Snapshot/Restore Pattern

```ts
describe('OrderService', () => {
  let snap

  beforeEach(() => {
    snap = container.snapshot()
  })

  afterEach(() => {
    container.restore(snap)
  })

  it('modifies container safely', () => {
    container.override(paymentGateway, mockPaymentGateway)
    // Test runs...
    // afterEach restores original state
  })
})
```

### Partial Mocking

```ts
// Only mock what you need - real dependencies for integration tests
const integrationContainer = container.withMocks([
  [externalApi, () => mockExternalApi]  // Only mock external deps
])

// Database, cache, etc. use real implementations
const result = await integrationContainer.get(orderService).processOrder(order)
```

### Mock Factories with State

```ts
function createMockDatabase() {
  const data = new Map()
  return {
    get: (id) => data.get(id),
    set: (id, value) => data.set(id, value),
    clear: () => data.clear()
  }
}

const testContainer = container.withMocks([
  [database, () => createMockDatabase()]
])

// Each test gets a fresh mock
```

### Type-Safe Mocks

```ts
// The mock must match the factory's return type
const typedMock: ReturnType<typeof database> = {
  query: async (sql) => [],
  close: async () => {}
}

const testContainer = container.withMocks([
  [database, () => typedMock]
])
```

## See Also

- [Gotchas: Testing](../gotchas.md#testing) - Common testing pitfalls
- [presets](./presets.md) - Pre-configured plugin combinations
