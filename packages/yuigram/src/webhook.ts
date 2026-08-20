/**
 * Webhook handling and its framework adapters.
 *
 * A subpath rather than part of the main entry point: an application that polls
 * should not carry the adapters, and one that uses a webhook imports exactly the
 * adapter it needs.
 */

export * from '@yuigram/bot-api/webhook'
