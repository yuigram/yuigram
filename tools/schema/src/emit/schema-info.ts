/**
 * The version the generated surface speaks.
 *
 * Emitted rather than written beside the surface by hand. A version kept by
 * hand is updated by remembering to, and the regeneration that moves the
 * surface to a new release is exactly the change that does not touch it — so
 * it goes on reporting the release before, with nothing to notice. Read off the
 * schema the surface was emitted from, it cannot disagree with that surface.
 */

import type { BotApiSchema } from '../bot-api/ir.js'
import { header } from './render.js'
import type { EmittedFile } from './types.js'

/** Emit the version constant. */
export function emitSchemaInfo(schema: BotApiSchema): EmittedFile {
  if (!/^\d+\.\d+$/.test(schema.version)) {
    throw new Error(`'${schema.version}' is not a Bot API version`)
  }

  return {
    path: 'schema-info.ts',
    contents: [
      header(schema.version, 'Pinned Bot API version'),
      '/**',
      ' * The Bot API version this build was generated from.',
      ' *',
      ' * Every method, type and event kind in the generated surface was read off',
      ' * this release, so a method Telegram added later has no signature here and',
      ' * is reached through `call()` until the surface is regenerated.',
      ' */',
      `export const BOT_API_VERSION = '${schema.version}' as const`,
      '',
    ].join('\n'),
  }
}
