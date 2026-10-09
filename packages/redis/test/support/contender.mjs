// SPDX-License-Identifier: MIT

// A separate process counting hits on one bucket through its own client. A
// child process does not inherit the test runner's TypeScript loader, so it
// registers one first.
import { register } from 'tsx/esm/api'

register()
await import('./contender.ts')
