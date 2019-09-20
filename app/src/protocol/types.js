// @flow
// protocol type defs
import type { ProtocolFile as SchemaV1ProtocolFile } from '@opentrons/shared-data/protocol/flowTypes/schemaV1'
import type { ProtocolFile as SchemaV3ProtocolFile } from '@opentrons/shared-data/protocol/flowTypes/schemaV3'

// data may be a full JSON protocol or just a metadata dict from Python
export type ProtocolData =
  | SchemaV1ProtocolFile<{}>
  | SchemaV3ProtocolFile<{}>
  | { metadata: $PropertyType<SchemaV1ProtocolFile<{}>, 'metadata'> }
// NOTE: add union of additional versions after schema is bumped

export type ProtocolFile = {
  name: string,
  type: ?string,
  lastModified: ?number,
  isBinary: boolean,
}

export type ProtocolState = {
  file: ?ProtocolFile,
  contents: ?string,
  data: ?ProtocolData,
}

export type ProtocolType = 'json' | 'python'
