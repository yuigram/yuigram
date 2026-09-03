/**
 * Holding several clients as one application.
 *
 * The container and the contract it holds clients through. Nothing here knows
 * what a client talks to, which is what lets one application hold clients from
 * subsystems that never import each other.
 */

export { App, AppError, type AppOptions, type ClientFailure } from './app.js'
export type { AppClient } from './client.js'
