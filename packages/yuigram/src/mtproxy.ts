/**
 * Connecting an account through an MTProxy.
 *
 * A subpath rather than part of the main entry point: only a program that
 * connects through a proxy loads it, and a browser — which cannot reach one —
 * gets a version that says so where the proxy is made.
 */

export * from '@yuigram/mtproto/mtproxy'
