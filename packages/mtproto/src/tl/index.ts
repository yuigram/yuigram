/**
 * The TL codec.
 *
 * Table-driven: the generator emits the wire layout of every constructor and
 * the reader and writer here interpret it. Nothing in this directory knows
 * which table it is working with — a scope decides that, and a scope is built
 * per channel.
 */

export {
  BOOL_FALSE_ID,
  BOOL_TRUE_ID,
  readObject,
  TlReadError,
  TlReader,
  VECTOR_ID,
} from './reader.js'
export { createRegistry, type TlRegistry, TlScope } from './registry.js'
export type { TlEntry, TlFieldSpec, TlTypeSpec, TlValue } from './schema.js'
export { TlWriteError, TlWriter, writeObject } from './writer.js'
