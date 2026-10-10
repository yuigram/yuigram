// SPDX-License-Identifier: MIT

// The worker's entry. A worker thread does not inherit the test runner's
// TypeScript loader, so it registers one before loading the host.
import { register } from 'tsx/esm/api'

register()
await import('./worker-host.ts')
