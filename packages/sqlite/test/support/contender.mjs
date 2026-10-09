// SPDX-License-Identifier: MPL-2.0

// A separate process counting hits on one shared bucket. A child process does
// not inherit the test runner's TypeScript loader, so it registers one first.
import { register } from 'tsx/esm/api'

register()
await import('./contender.ts')
