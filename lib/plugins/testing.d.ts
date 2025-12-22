import { Container, Factory, Plugin } from "../core.js"

export interface ContainerSnapshot {
  cache: Map<Factory<any>, any>
  overrides: Map<Factory<any>, Factory<any>>
}

export interface TestingMethods {
  withMocks(
    mocks: Array<[Factory<any>, Factory<any>]> | Map<Factory<any>, Factory<any>>
  ): Container
  snapshot(): ContainerSnapshot
  restore(snapshot: ContainerSnapshot): void
}

export const testing: Plugin<TestingMethods>
