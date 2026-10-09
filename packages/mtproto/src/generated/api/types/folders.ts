// GENERATED FILE — do not edit.
// TL types for folders
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_i$ from './root/i.js'
import type { TlObject } from '../../../tl/object.js'

/** `folders.editPeerFolders#6847d0ab` */
export interface EditPeerFolders {
  readonly _: 'folders.editPeerFolders'
  readonly folder_peers: readonly root_i$.TypeInputFolderPeer[]
}
