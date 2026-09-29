/**
 * WebCast Channel B 解析 E2E 冒烟测试（契约复现模式）
 *
 * 验证链路：
 *   1. 测试内嵌 proto 与 frontend/lib/main/webcast.ts 的 WEBCAST_PROTO 逐字一致（防两侧漂移）
 *   2. 用 protobufjs 构造真实 PushFrame（gzip 压缩的 LiveResponse 批次）
 *   3. 按 main 侧 parseWebcastFrame 的完全相同逻辑解码，验证：
 *      - WebcastChatMessage → 标准化弹幕（user/content → user/text）
 *      - WebcastGiftMessage → gift 文本化（giftId × comboCount）
 *      - 大 msgId（≥ 2^53）long→string 精度保真
 *      - 非 gzip 帧（plain payload）与非法帧健壮性
 *
 * 运行：node frontend/test/webcast-e2e.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const requireFront = createRequire(join(__dirname, '..', 'package.json'))
const root = join(__dirname, '..')

// ---- 契约检查：测试内嵌 proto 必须与 webcast.ts 的 WEBCAST_PROTO 逐字一致 ----
const webcastSrc = readFileSync(join(root, 'lib/main/webcast.ts'), 'utf8')
const start = webcastSrc.indexOf('WEBCAST_PROTO')
if (start < 0) {
  console.error('FAIL: webcast.ts 中未找到 WEBCAST_PROTO')
  process.exit(1)
}
const tmplStart = webcastSrc.indexOf('`', start)
const tmplEnd = webcastSrc.indexOf('`', tmplStart + 1)
const webcastProto = webcastSrc.slice(tmplStart + 1, tmplEnd)

const TEST_PROTO = `
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

if (webcastProto !== TEST_PROTO) {
  console.error('FAIL: 测试内嵌 proto 与 webcast.ts 的 WEBCAST_PROTO 不一致（两侧漂移），请同步')
  process.exit(1)
}
console.log('contract check: 测试 proto 与 webcast.ts 逐字一致 ✓')

// ---- 用 protobufjs 加载（与 main 侧相同的 parse 选项）----
const protobuf = requireFront('protobufjs')
const r = protobuf.parse(TEST_PROTO, { keepCase: true, alternateCommentMode: true }).root
const PushFrame = r.lookupType('PushFrame')
const LiveResponse = r.lookupType('LiveResponse')
const Message = r.lookupType('Message')
const ChatMessage = r.lookupType('ChatMessage')
const GiftMessage = r.lookupType('GiftMessage')
const MemberMessage = r.lookupType('MemberMessage')

function longToString(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'low' in v) return String(v.toString?.() ?? '')
  return String(v)
}

/** 与 main 侧 parseWebcastFrame 完全一致的解析逻辑（复制自 webcast.ts） */
function parseWebcastFrame(bin, platform) {
  if (!bin || bin.length === 0) return []
  let frame
  try {
    frame = PushFrame.decode(bin)
  } catch {
    return []
  }
  const payloadBytes = frame.payload ?? new Uint8Array(0)
  if (payloadBytes.length === 0) return []
  let respBytes
  try {
    const encoding = String(frame.payloadEncoding ?? '')
    respBytes = encoding === 'gzip' ? zlib.gunzipSync(Buffer.from(payloadBytes)) : Buffer.from(payloadBytes)
  } catch {
    return []
  }
  let resp
  try {
    resp = LiveResponse.decode(respBytes)
  } catch {
    return []
  }
  const out = []
  const list = resp.messagesList ?? []
  const now = Date.now()
  for (const m of list) {
    const method = String(m.method ?? '')
    const msgId = longToString(m.msgId)
    const payload = m.payload ?? new Uint8Array(0)
    const emit = (type, user, text) => out.push({ id: msgId, user, text, platform, timestamp: now, type })
    const decode = (name) => {
      if (payload.length === 0) return null
      try {
        return r.lookupType(name).decode(payload)
      } catch {
        return null
      }
    }
    switch (method) {
      case 'WebcastChatMessage': {
        const cm = decode('ChatMessage')
        if (cm?.content) emit('comment', cm.user?.nickname || cm.user?.display_id || 'Anonymous', cm.content)
        break
      }
      case 'WebcastGiftMessage': {
        const gm = decode('GiftMessage')
        if (gm?.user?.nickname) {
          const name = gm.user.display_id || gm.user.nickname
          emit('gift', name, `🎁 ${String(gm.giftId || 'gift')} x${longToString(gm.comboCount) || 1}`)
        }
        break
      }
      case 'WebcastMemberMessage': {
        const mm = decode('MemberMessage')
        if (mm?.user?.nickname) emit('member_join', mm.user.nickname, 'entered the room')
        break
      }
      default:
        break
    }
  }
  return out
}

function encodePushFrame(msgs, encoding = 'gzip') {
  // 传 Message 对象（非字节串）让 protobufjs 自动嵌套编码 repeated Message
  const live = LiveResponse.encode({ messagesList: msgs }).finish()
  const payload = encoding === 'gzip' ? zlib.gzipSync(Buffer.from(live)) : Buffer.from(live)
  return Buffer.from(PushFrame.encode({ seqId: 42, payloadEncoding: encoding, payload }).finish())
}

let pass = true
const assert = (cond, label) => {
  if (!cond) { pass = false; console.error('FAIL:', label) } else { console.log('PASS:', label) }
}

// ---- 用例 1：混合批次（chat + gift + member），含大 msgId ----
const BIG_MSGID = 9007199254740993n // 2^53 + 1
const chat = {
  method: 'WebcastChatMessage',
  msgId: '1111',
  payload: ChatMessage.encode({ user: { id: 1, nickname: 'user_hanoi' }, content: '越南语弹幕 你好' }).finish(),
}
const gift = {
  method: 'WebcastGiftMessage',
  msgId: String(BIG_MSGID),
  payload: GiftMessage.encode({ giftId: 'rose', comboCount: 5, user: { id: 2, nickname: 'giver' } }).finish(),
}
const member = {
  method: 'WebcastMemberMessage',
  msgId: '3333',
  payload: MemberMessage.encode({ user: { id: 3, nickname: 'newbie' }, memberCount: 120 }).finish(),
}

const result = parseWebcastFrame(encodePushFrame([chat, gift, member]), 'douyin')
console.log('\n解析结果（混合批次，gzip）：')
for (const x of result) console.log(' ', JSON.stringify(x))

assert(result.length === 3, '混合批次解析出 3 条')
assert(
  result[0].user === 'user_hanoi' && result[0].text === '越南语弹幕 你好' && result[0].type === 'comment',
  'WebcastChatMessage → 标准化弹幕（user/text/type 正确）',
)
assert(result[1].id === '9007199254740993', '大 msgId 保真（long→string，无 2^53 精度丢失）')
assert(result[1].text === '🎁 rose x5' && result[1].type === 'gift', 'WebcastGiftMessage → 礼物文本化')
assert(result[2].type === 'member_join' && result[2].user === 'newbie', 'WebcastMemberMessage → 进入房间')
assert(result.every((x) => x.platform === 'douyin' && x.timestamp > 0), 'platform/timestamp 字段齐全')

// ---- 用例 2：非 gzip（plain）帧 ----
const plainResult = parseWebcastFrame(encodePushFrame([chat], ''), 'douyin')
assert(plainResult.length === 1 && plainResult[0].text === '越南语弹幕 你好', '非 gzip 帧（plain payload）正常解码')

// ---- 用例 3：健壮性 ----
assert(parseWebcastFrame(Buffer.alloc(0), 'douyin').length === 0, '空输入返回空数组')
assert(parseWebcastFrame(Buffer.from([1, 2, 3]), 'douyin').length === 0, '非法帧返回空数组不抛异常')
// 损坏 payload 帧：protobuf 结构合法，但 payload 既非 gzip 也非 LiveResponse
// → gunzipSync 抛异常被捕获 → 返回空数组（验证不崩）
const corruptFrame = Buffer.from(
  PushFrame.encode({ seqId: 7, payloadEncoding: 'gzip', payload: Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]) }).finish(),
)
const corruptResult = parseWebcastFrame(corruptFrame, 'douyin')
assert(Array.isArray(corruptResult) && corruptResult.length === 0, '损坏 payload（非法 gzip）返回空数组不抛异常')

// ---- 用例 4：未知 method 静默忽略（不崩、不产生脏数据）----
const unknown = {
  method: 'UnknownEvent',
  msgId: '9999',
  payload: Buffer.from('whatever'),
}
assert(parseWebcastFrame(encodePushFrame([unknown]), 'douyin').length === 0, '未知事件静默忽略')

console.log(pass ? '\n✅ ALL PASS' : '\n❌ HAS FAILURES')
process.exit(pass ? 0 : 1)
