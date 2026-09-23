/**
 * Running an account in a worker, from the package most programs install.
 *
 * Its own entry point for the reason the subsystem has one: importing
 * `yuigram` must not create a worker, install a listener or load any of this.
 * `docs/runtimes.md` §6 says which platforms provide which kind of worker.
 */

export * from '@yuigram/mtproto/worker'
