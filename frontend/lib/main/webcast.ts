/**
 * 喜阅 TransFlow · WebCast 弹幕协议解析器（Channel B — 主进程侧）
 *
 * 与 Python 协议层（backend/static/Live.proto + Live_pb2.py）共享同一套
 * WebCast Protobuf Schema。截取自该文件，仅保留弹幕/礼物/成员/点赞/统计
 * 六类 payload 与 User 的关键字段，降低 JS 侧解析内存与体积。
 *
 * 数据流：原始二进制 WS 帧 → PushFrame → gzip 解压 payload → LiveResponse
 *        → messagesList[] → 按 method 分派 → StandardDanmaku[]
 *
 * 平台无关：抖音 / TikTok 同源于 WebCast IM push 协议，schema 一致。
 */
import * as protobuf from 'protobufjs'
import { gunzipSync } from 'node:zlib'
import type { StandardDanmaku } from '@/types'

/** 截取的 WebCast proto（字段号与 backend/static/Live.proto 严格对齐） */
const WEBCAST_PROTO = `
syntax = "proto3";

message HeadersList {
  string key = 1;
  string value = 2;
}

message PushFrame {
  uint64 seqId = 1;
  uint64 logId = 2;
  uint64 service = 3;
  uint64 method = 4;
  repeated HeadersList headersList = 5;
  string payloadEncoding = 6;
  string payloadType = 7;
  bytes payload = 8;
  string logIdNew = 9;
}

message Message {
  string method = 1;
  bytes payload = 2;
  int64 msgId = 3;
  int32 msgType = 4;
  int64 offset = 5;
  bool needWrdsStore = 6;
  int64 wrdsVersion = 7;
  string wrdsSubKey = 8;
}

message LiveResponse {
  repeated Message messagesList = 1;
  string cursor = 2;
  uint64 fetchInterval = 3;
  uint64 now = 4;
  string internalExt = 5;
  uint32 fetchType = 6;
  map<string, string> routeParams = 7;
  uint64 heartbeatDuration = 8;
  bool needAck = 9;
}

message User {
  int64 id = 1;
  string nickname = 3;
  string display_id = 38;
  string desensitized_nickname = 68;
}

message ChatMessage {
  User user = 2;
  string content = 3;
}

message GiftMessage {
  string giftId = 2;
  int64 comboCount = 6;
  User user = 7;
}

message MemberMessage {
  User user = 2;
  int64 memberCount = 3;
}

message LikeMessage {
  int64 count = 2;
  int64 total = 3;
  User user = 5;
}

message SocialMessage {
  User user = 2;
  int64 action = 4;
}

message RoomStatsMessage {
  string displayLong = 4;
  int64 total = 9;
}
`

let root: protobuf.Root | null = null

function getRoot(): protobuf.Root {
  if (!root) {
    root = protobuf.parse(WEBCAST_PROTO, { keepCase: true, alternateCommentMode: true }).root
  }
  return root
}

function longToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'low' in (v as Record<string, unknown>)) {
    // protobufjs Long
    return String((v as { toString?: (b?: number) => string }).toString?.() ?? '')
  }
  return String(v)
}

/**
 * 解析一个 WebCast 二进制帧为标准化弹幕列表。
 * 任何解码失败都返回 []（静默丢弃），保证采集通道健壮不崩。
 */
export function parseWebcastFrame(
  bin: Uint8Array,
  platform: string
): StandardDanmaku[] {
  if (!bin || bin.length === 0) return []
  const r = getRoot()
  const PushFrame = r.lookupType('PushFrame')
  const LiveResponse = r.lookupType('LiveResponse')

  let frame: { payload?: Uint8Array; payloadEncoding?: string }
  try {
    frame = PushFrame.decode(bin) as { payload?: Uint8Array; payloadEncoding?: string }
  } catch {
    return []
  }

  const payloadBytes: Uint8Array = frame.payload ?? new Uint8Array(0)
  if (payloadBytes.length === 0) return []

  // 按 payloadEncoding 解压（WebCast 默认 gzip）
  let respBytes: Buffer
  try {
    const encoding = String(frame.payloadEncoding ?? '')
    if (encoding === 'gzip') {
      respBytes = gunzipSync(Buffer.from(payloadBytes))
    } else {
      respBytes = Buffer.from(payloadBytes)
    }
  } catch {
    return []
  }

  let resp: { messagesList?: Array<{ method?: string; msgId?: unknown; payload?: Uint8Array }> }
  try {
    resp = LiveResponse.decode(respBytes) as {
      messagesList?: Array<{ method?: string; msgId?: unknown; payload?: Uint8Array }>
    }
  } catch {
    return []
  }

  const out: StandardDanmaku[] = []
  const list = resp.messagesList ?? []
  const now = Date.now()

  for (const m of list) {
    const method = String(m.method ?? '')
    const msgId = longToString(m.msgId)
    const payload: Uint8Array = m.payload ?? new Uint8Array(0)
    const emit = (type: StandardDanmaku['type'], user: string, text: string): void => {
      out.push({ id: msgId, user, text, platform, timestamp: now, type })
    }

    const decode = <T = protobuf.Message>(name: string): T | null => {
      if (payload.length === 0) return null
      try {
        return r.lookupType(name).decode(payload) as T
      } catch {
        return null
      }
    }

    switch (method) {
      case 'WebcastChatMessage': {
        const cm = decode<{ user?: { nickname?: string; display_id?: string }; content?: string }>(
          'ChatMessage'
        )
        if (cm?.content) {
          emit('comment', cm.user?.nickname || cm.user?.display_id || 'Anonymous', cm.content)
        }
        break
      }
      case 'WebcastGiftMessage': {
        const gm = decode<{ user?: { nickname?: string; display_id?: string }; giftId?: string; comboCount?: unknown }>(
          'GiftMessage'
        )
        if (gm?.user?.nickname) {
          const name = gm.user.display_id || gm.user.nickname
          emit('gift', name, `🎁 ${String(gm.giftId || 'gift')} x${longToString(gm.comboCount) || 1}`)
        }
        break
      }
      case 'WebcastMemberMessage': {
        const mm = decode<{ user?: { nickname?: string } }>('MemberMessage')
        if (mm?.user?.nickname) emit('member_join', mm.user.nickname, 'entered the room')
        break
      }
      case 'WebcastLikeMessage': {
        const lm = decode<{ user?: { nickname?: string }; count?: unknown }>('LikeMessage')
        if (lm?.user?.nickname) emit('social', lm.user.nickname, `👍 x${longToString(lm.count) || 1}`)
        break
      }
      case 'WebcastSocialMessage': {
        const sm = decode<{ user?: { nickname?: string }; action?: unknown }>('SocialMessage')
        if (sm?.user?.nickname) {
          emit('social', sm.user.nickname, longToString(sm.action) === '1' ? 'followed the streamer' : 'interacted')
        }
        break
      }
      case 'WebcastRoomStatsMessage': {
        const rs = decode<{ displayLong?: string }>('RoomStatsMessage')
        if (rs?.displayLong) emit('room_stats', 'System', rs.displayLong)
        break
      }
      default:
        break
    }
  }
  return out
}
