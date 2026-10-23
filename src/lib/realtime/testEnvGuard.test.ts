import { describe, expect, it } from 'vitest'
import { dataProvider, USE_REAL_BACKEND } from './dataProvider'
import { mockDataProvider } from '@/mocks/mockDataProvider'

// A developer's .env sets VITE_USE_REAL_BACKEND=true for the dev server, and
// vite loads it into tests too. Without vitest.config.ts overriding it, every
// test that touched a store resolved the `dataProvider` singleton to
// RealDataProvider and called whatever was listening on localhost:8000.
describe('the test environment cannot reach a real backend by accident', () => {
  it('resolves the dataProvider singleton to the mock', () => {
    expect(USE_REAL_BACKEND).toBe(false)
    expect(dataProvider).toBe(mockDataProvider)
  })
})
