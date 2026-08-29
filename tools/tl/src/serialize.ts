/**
 * The committed form of the intermediate representation.
 *
 * The IR is written as JSON so a schema update is a reviewable diff rather than
 * an opaque change in generated output. That only works if the serialization is
 * stable, so keys are emitted in a fixed order and nothing environment-specific
 * enters the file.
 */

import type { TlCombinator, TlParam, TlSchema, TlType } from './ir.js'

/** Serialize a schema to the exact bytes committed under `schemas/tl/`. */
export function serializeSchema(schema: TlSchema): string {
  const document = {
    table: schema.table,
    layer: schema.layer,
    constructors: schema.constructors.map(serializeCombinator),
    methods: schema.methods.map(serializeCombinator),
  }

  return `${JSON.stringify(document, null, 2)}\n`
}

/**
 * One combinator, with its id in hexadecimal.
 *
 * Hexadecimal rather than a decimal number because that is how the schema
 * writes it, and a reviewer comparing the IR against the `.tl` should not have
 * to convert.
 */
function serializeCombinator(combinator: TlCombinator): Record<string, unknown> {
  return {
    name: combinator.name,
    id: `0x${combinator.id.toString(16).padStart(8, '0')}`,
    idOrigin: combinator.idOrigin,
    ...(combinator.generics.length > 0 ? { generics: combinator.generics } : {}),
    params: combinator.params.map(serializeParam),
    result: serializeType(combinator.result),
  }
}

function serializeParam(param: TlParam): Record<string, unknown> {
  if (param.kind === 'bitfield') return { name: param.name, bitfield: true }

  return {
    name: param.name,
    type: serializeType(param.type),
    ...(param.conditional === null
      ? {}
      : { conditional: { field: param.conditional.field, bit: param.conditional.bit } }),
  }
}

function serializeType(type: TlType): unknown {
  switch (type.kind) {
    case 'primitive':
      return type.name
    case 'named':
      return type.bare ? { bare: type.name } : type.name
    case 'vector':
      return { vector: serializeType(type.item), ...(type.bare ? { bare: true } : {}) }
    case 'generic':
      return { generic: type.name }
    case 'repeat':
      return {
        repeat: serializeType(type.item),
        ...(type.count === null ? {} : { count: type.count }),
      }
    case 'opaque':
      return { opaque: true }
  }
}
