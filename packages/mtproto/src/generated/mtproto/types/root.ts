// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram MTProto schema, schemas/tl/mtproto.tl
// SPDX-License-Identifier: MPL-2.0

import type { TlObject } from '../../../tl/object.js'

/** `bad_msg_notification#a7eff811` */
export interface BadMsgNotification {
  readonly _: 'bad_msg_notification'
  readonly bad_msg_id: bigint
  readonly bad_msg_seqno: number
  readonly error_code: number
}

/** `bad_server_salt#edab447b` */
export interface BadServerSalt {
  readonly _: 'bad_server_salt'
  readonly bad_msg_id: bigint
  readonly bad_msg_seqno: number
  readonly error_code: number
  readonly new_server_salt: bigint
}

/** `bind_auth_key_inner#75a3f765` */
export interface BindAuthKeyInner {
  readonly _: 'bind_auth_key_inner'
  readonly nonce: bigint
  readonly temp_auth_key_id: bigint
  readonly perm_auth_key_id: bigint
  readonly temp_session_id: bigint
  readonly expires_at: number
}

/** `client_DH_inner_data#6643b654` */
export interface ClientDHInnerData {
  readonly _: 'client_DH_inner_data'
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly retry_id: bigint
  readonly g_b: Uint8Array
}

/** `destroy_auth_key#d1435160` */
export interface DestroyAuthKey {
  readonly _: 'destroy_auth_key'
}

/** `destroy_auth_key_fail#ea109b13` */
export interface DestroyAuthKeyFail {
  readonly _: 'destroy_auth_key_fail'
}

/** `destroy_auth_key_none#0a9f2259` */
export interface DestroyAuthKeyNone {
  readonly _: 'destroy_auth_key_none'
}

/** `destroy_auth_key_ok#f660e1d4` */
export interface DestroyAuthKeyOk {
  readonly _: 'destroy_auth_key_ok'
}

/** `destroy_session#e7512126` */
export interface DestroySession {
  readonly _: 'destroy_session'
  readonly session_id: bigint
}

/** `destroy_session_none#62d350c9` */
export interface DestroySessionNone {
  readonly _: 'destroy_session_none'
  readonly session_id: bigint
}

/** `destroy_session_ok#e22045fc` */
export interface DestroySessionOk {
  readonly _: 'destroy_session_ok'
  readonly session_id: bigint
}

/** `dh_gen_fail#a69dae02` */
export interface DhGenFail {
  readonly _: 'dh_gen_fail'
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly new_nonce_hash3: Uint8Array
}

/** `dh_gen_ok#3bcbf734` */
export interface DhGenOk {
  readonly _: 'dh_gen_ok'
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly new_nonce_hash1: Uint8Array
}

/** `dh_gen_retry#46dc1fb9` */
export interface DhGenRetry {
  readonly _: 'dh_gen_retry'
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly new_nonce_hash2: Uint8Array
}

/** `future_salt#0949d9dc` */
export interface FutureSalt {
  readonly _: 'future_salt'
  readonly valid_since: number
  readonly valid_until: number
  readonly salt: bigint
}

/** `future_salts#ae500895` */
export interface FutureSalts {
  readonly _: 'future_salts'
  readonly req_msg_id: bigint
  readonly now: number
  readonly salts: readonly FutureSalt[]
}

/** `get_future_salts#b921bd04` */
export interface GetFutureSalts {
  readonly _: 'get_future_salts'
  readonly num: number
}

/** `gzip_packed#3072cfa1` */
export interface GzipPacked {
  readonly _: 'gzip_packed'
  readonly packed_data: Uint8Array
}

/** `http_wait#9299359f` */
export interface HttpWait {
  readonly _: 'http_wait'
  readonly max_delay: number
  readonly wait_after: number
  readonly max_wait: number
}

/** `message#5bb8e511` */
export interface Message {
  readonly _: 'message'
  readonly msg_id: bigint
  readonly seqno: number
  readonly bytes: number
  readonly body: TlObject
}

/** `msg_container#73f1f8dc` */
export interface MsgContainer {
  readonly _: 'msg_container'
  readonly messages: readonly TypeMessage[]
}

/** `msg_copy#e06046b2` */
export interface MsgCopy {
  readonly _: 'msg_copy'
  readonly orig_message: TypeMessage
}

/** `msg_detailed_info#276d3ec6` */
export interface MsgDetailedInfo {
  readonly _: 'msg_detailed_info'
  readonly msg_id: bigint
  readonly answer_msg_id: bigint
  readonly bytes: number
  readonly status: number
}

/** `msg_new_detailed_info#809db6df` */
export interface MsgNewDetailedInfo {
  readonly _: 'msg_new_detailed_info'
  readonly answer_msg_id: bigint
  readonly bytes: number
  readonly status: number
}

/** `msg_resend_req#7d861a08` */
export interface MsgResendReq {
  readonly _: 'msg_resend_req'
  readonly msg_ids: readonly bigint[]
}

/** `msgs_ack#62d6b459` */
export interface MsgsAck {
  readonly _: 'msgs_ack'
  readonly msg_ids: readonly bigint[]
}

/** `msgs_all_info#8cc0d131` */
export interface MsgsAllInfo {
  readonly _: 'msgs_all_info'
  readonly msg_ids: readonly bigint[]
  readonly info: Uint8Array
}

/** `msgs_state_info#04deb57d` */
export interface MsgsStateInfo {
  readonly _: 'msgs_state_info'
  readonly req_msg_id: bigint
  readonly info: Uint8Array
}

/** `msgs_state_req#da69fb52` */
export interface MsgsStateReq {
  readonly _: 'msgs_state_req'
  readonly msg_ids: readonly bigint[]
}

/** `new_session_created#9ec20908` */
export interface NewSessionCreated {
  readonly _: 'new_session_created'
  readonly first_msg_id: bigint
  readonly unique_id: bigint
  readonly server_salt: bigint
}

/** `p_q_inner_data_dc#a9f55f95` */
export interface PQInnerDataDc {
  readonly _: 'p_q_inner_data_dc'
  readonly pq: Uint8Array
  readonly p: Uint8Array
  readonly q: Uint8Array
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly new_nonce: Uint8Array
  readonly dc: number
}

/** `p_q_inner_data_temp_dc#56fddf88` */
export interface PQInnerDataTempDc {
  readonly _: 'p_q_inner_data_temp_dc'
  readonly pq: Uint8Array
  readonly p: Uint8Array
  readonly q: Uint8Array
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly new_nonce: Uint8Array
  readonly dc: number
  readonly expires_in: number
}

/** `ping#7abe77ec` */
export interface Ping {
  readonly _: 'ping'
  readonly ping_id: bigint
}

/** `ping_delay_disconnect#f3427b8c` */
export interface PingDelayDisconnect {
  readonly _: 'ping_delay_disconnect'
  readonly ping_id: bigint
  readonly disconnect_delay: number
}

/** `pong#347773c5` */
export interface Pong {
  readonly _: 'pong'
  readonly msg_id: bigint
  readonly ping_id: bigint
}

/** `req_DH_params#d712e4be` */
export interface ReqDHParams {
  readonly _: 'req_DH_params'
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly p: Uint8Array
  readonly q: Uint8Array
  readonly public_key_fingerprint: bigint
  readonly encrypted_data: Uint8Array
}

/** `req_pq_multi#be7e8ef1` */
export interface ReqPqMulti {
  readonly _: 'req_pq_multi'
  readonly nonce: Uint8Array
}

/** `resPQ#05162463` */
export interface ResPQ {
  readonly _: 'resPQ'
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly pq: Uint8Array
  readonly server_public_key_fingerprints: readonly bigint[]
}

/** `rpc_answer_dropped#a43ad8b7` */
export interface RpcAnswerDropped {
  readonly _: 'rpc_answer_dropped'
  readonly msg_id: bigint
  readonly seq_no: number
  readonly bytes: number
}

/** `rpc_answer_dropped_running#cd78e586` */
export interface RpcAnswerDroppedRunning {
  readonly _: 'rpc_answer_dropped_running'
}

/** `rpc_answer_unknown#5e2ad36e` */
export interface RpcAnswerUnknown {
  readonly _: 'rpc_answer_unknown'
}

/** `rpc_drop_answer#58e4a740` */
export interface RpcDropAnswer {
  readonly _: 'rpc_drop_answer'
  readonly req_msg_id: bigint
}

/** `rpc_error#2144ca19` */
export interface RpcError {
  readonly _: 'rpc_error'
  readonly error_code: number
  readonly error_message: string
}

/** `rpc_result#f35c6d01` */
export interface RpcResult {
  readonly _: 'rpc_result'
  readonly req_msg_id: bigint
  readonly result: TlObject
}

/** `server_DH_inner_data#b5890dba` */
export interface ServerDHInnerData {
  readonly _: 'server_DH_inner_data'
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly g: number
  readonly dh_prime: Uint8Array
  readonly g_a: Uint8Array
  readonly server_time: number
}

/** `server_DH_params_ok#d0e8075c` */
export interface ServerDHParamsOk {
  readonly _: 'server_DH_params_ok'
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly encrypted_answer: Uint8Array
}

/** `set_client_DH_params#f5045f1f` */
export interface SetClientDHParams {
  readonly _: 'set_client_DH_params'
  readonly nonce: Uint8Array
  readonly server_nonce: Uint8Array
  readonly encrypted_data: Uint8Array
}

/** Any `BadMsgNotification`. */
export type TypeBadMsgNotification =
  | BadMsgNotification
  | BadServerSalt

/** Any `BindAuthKeyInner`. */
export type TypeBindAuthKeyInner =
  | BindAuthKeyInner

/** Any `Client_DH_Inner_Data`. */
export type TypeClientDHInnerData =
  | ClientDHInnerData

/** Any `DestroyAuthKeyRes`. */
export type TypeDestroyAuthKeyRes =
  | DestroyAuthKeyFail
  | DestroyAuthKeyNone
  | DestroyAuthKeyOk

/** Any `DestroySessionRes`. */
export type TypeDestroySessionRes =
  | DestroySessionNone
  | DestroySessionOk

/** Any `FutureSalt`. */
export type TypeFutureSalt =
  | FutureSalt

/** Any `FutureSalts`. */
export type TypeFutureSalts =
  | FutureSalts

/** Any `HttpWait`. */
export type TypeHttpWait =
  | HttpWait

/** Any `Message`. */
export type TypeMessage =
  | Message

/** Any `MessageContainer`. */
export type TypeMessageContainer =
  | MsgContainer

/** Any `MessageCopy`. */
export type TypeMessageCopy =
  | MsgCopy

/** Any `MsgDetailedInfo`. */
export type TypeMsgDetailedInfo =
  | MsgDetailedInfo
  | MsgNewDetailedInfo

/** Any `MsgResendReq`. */
export type TypeMsgResendReq =
  | MsgResendReq

/** Any `MsgsAck`. */
export type TypeMsgsAck =
  | MsgsAck

/** Any `MsgsAllInfo`. */
export type TypeMsgsAllInfo =
  | MsgsAllInfo

/** Any `MsgsStateInfo`. */
export type TypeMsgsStateInfo =
  | MsgsStateInfo

/** Any `MsgsStateReq`. */
export type TypeMsgsStateReq =
  | MsgsStateReq

/** Any `NewSession`. */
export type TypeNewSession =
  | NewSessionCreated

/** Any `P_Q_inner_data`. */
export type TypePQInnerData =
  | PQInnerDataDc
  | PQInnerDataTempDc

/** Any `Pong`. */
export type TypePong =
  | Pong

/** Any `ResPQ`. */
export type TypeResPQ =
  | ResPQ

/** Any `RpcDropAnswer`. */
export type TypeRpcDropAnswer =
  | RpcAnswerDropped
  | RpcAnswerDroppedRunning
  | RpcAnswerUnknown

/** Any `RpcError`. */
export type TypeRpcError =
  | RpcError

/** Any `RpcResult`. */
export type TypeRpcResult =
  | RpcResult

/** Any `Server_DH_inner_data`. */
export type TypeServerDHInnerData =
  | ServerDHInnerData

/** Any `Server_DH_Params`. */
export type TypeServerDHParams =
  | ServerDHParamsOk

/** Any `Set_client_DH_params_answer`. */
export type TypeSetClientDHParamsAnswer =
  | DhGenFail
  | DhGenOk
  | DhGenRetry
