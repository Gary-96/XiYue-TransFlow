# 乐曼同传小助手 — 全项目工程审计与重构建议报告

> 审计时间：2026-09-26  
> 审计范围：frontend/src/ + backend/ + main/index.ts + preload  
> 审计维度：工程化、架构、安全、类型安全、i18n

---

## 📊 项目概况

| 维度 | 指标 |
|---|---|
| **技术栈** | Electron 31 + React 18 + TypeScript + Vite + Tailwind v4 |
| **后端框架** | FastAPI + faster-whisper + Edge TTS |
| **代码规模** | 前端 37 个 TS/TSX 文件 (~4,700 行)，后端 37 个 Python 文件 (~7,800 行) |
| **目录结构** | features/（按业务域拆分）+ common/ + ui/ + hooks/ + services/ |
| **Git 历史** | 6 个正式 commit，main 分支 |
| **当前状态** | P0/P1 缺陷已部分修复，仍需深度重构 |

---

## 🔴 P0 级严重缺陷

### P0-1: 全局 EventEmitter 跨窗口污染（高风险）

**位置**：`frontend/src/renderer/hooks/useWebSocket.ts:40`

```typescript
// 模块级全局单例 — 多窗口模式下所有实例共享同一 eventEmitter
const eventEmitter = new EventEmitter()
```

**问题**：
- 弹幕消息和语言切换事件通过全局 EventEmitter 广播
- 若存在多窗口（主控台 + 悬浮字幕窗），事件会串台
- 无独立作用域隔离，内存泄漏风险

**影响**：多窗口场景下弹幕混乱、语言切换失控  
**修复方案**：改用 React Context 或 per-window EventEmitter

---

### P0-2: 未使用 `api.ts` 封装，直接裸写 fetch

**位置**：多个组件和 hook

```typescript
// ❌ 错误的：直接裸写 fetch
const res = await fetch(`${API_BASE}/api/language/set`, { ... })
const data = await res.json()

// ✅ 正确的：使用封装
const data = await apiPut('/api/language/set', { src_lang, tgt_lang })
```

**影响**：
- 错误处理逻辑分散，难以统一维护
- 缺少统一的超时控制和重试机制
- 类型推断丢失（`as SomeType` 四处可见）

**修复建议**：
1. 将 `useDashboardLogic.ts`、`useWebSocket.ts` 中的直接 fetch 调用迁移到 `services/api.ts`
2. 为 api.ts 添加类型安全的请求拦截器

---

### P0-3: TypeScript 类型安全缺陷

**位置**：多处 `as any` 和未处理的 null/undefined

```typescript
// ❌ 危险：any 类型
(window as any).electronAPI = electronAPI  // preload/index.ts:79

// ❌ 危险：未校验的嵌套访问
transcription.transcription.text  // 可能为 undefined

// ❌ 危险：类型断言绕过检查
const msg = parsed as Exclude<WebSocketMessage, CallSubtitle> & { ... }
```

**影响**：运行时崩溃风险，调试困难

---

### P0-4: Whisper 依赖探测不完整

**位置**：`backend/app/services/whisper_service.py:20-37`

```python
def _check_dependencies() -> tuple[bool, str]:
    missing = []
    try:
        import numpy  # noqa: F401
    except ImportError:
        missing.append("numpy")
    # ... 只检查 numpy, torch, faster_whisper
```

**缺失检查**：
- `sounddevice` — 音频采集必需
- `scipy` — 音频处理可选但推荐
- `edge-tts` — TTS 功能必需

---

## 🟡 P1 级稳定性隐患

### P1-1: OllamaBackend.is_available 事件循环冲突

**位置**：`backend/app/services/llm_service.py:62-80`

```python
@property
def is_available(self) -> bool:
    try:
        loop = asyncio.get_running_loop()
        raise RuntimeError("OllamaBackend.is_available 不能在异步上下文调用...")
    except RuntimeError as e:
        if "不能在异步上下文调用" in str(e):
            raise
        return asyncio.get_event_loop().run_until_complete(self._check_health())
```

**问题**：
- 手动检测事件循环并抛出自定义异常，逻辑脆弱
- `run_until_complete()` 在已运行事件循环中会抛出 RuntimeError
- 已有修复版本（`is_available_async()`），但属性访问仍存在风险

**修复方案**：
```python
# 彻底移除同步属性，只保留异步方法
async def is_available(self) -> bool:
    return await self._check_health()
```

---

### P1-2: 打包路径假设脆弱

**位置**：`backend/app/services/whisper_service.py:71-80`

```python
elif sys._MEIPASS:
    # 打包环境：模型放在资源目录下
    model_dir = os.path.join(sys._MEIPASS, "models", "faster-whisper")
    if not os.path.exists(model_dir):
        model_dir = None  # 回退到默认缓存路径 — 静默失败！
```

**问题**：
- PyInstaller 打包后模型通常不在 `_MEIPASS` 内
- 静默回退可能导致模型加载失败而无明显提示

**修复方案**：引入统一的 `get_resource_path()` 工具函数
```python
def get_resource_path(relative_path: str) -> Path:
    if getattr(sys, 'frozen', False):
        base_path = Path(sys._MEIPASS)
    else:
        base_path = Path(__file__).resolve().parent.parent
    return base_path / relative_path
```

---

### P1-3: 音频设备热拔插保护不足

**位置**：`frontend/src/renderer/hooks/useWebSocket.ts:218-334`

```typescript
const startRecording = useCallback(async () => {
  // ...
  const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
  streamRef.current = stream
  // ...
}, [ttsEnabled])
```

**问题**：
- 声卡拔出时未捕获 `InvalidStateError`
- 设备变更时 MediaStream 可能已失效但未清理

**修复方案**：
```typescript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
  streamRef.current = stream
  // 监听设备变更
  navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
} catch (err) {
  if (err.name === 'NotFoundError' || err.name === 'NotReadableError') {
    toast({ title: '无法访问麦克风', variant: 'destructive' })
  }
}
```

---

### P1-4: preload 双保险挂载冗余

**位置**：`frontend/src/preload/index.ts:70-79`

```typescript
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
    contextBridge.exposeInMainWorld('electron', electronAPI)  // ❌ 冗余
  } catch (error) {
    console.error('Preload contextBridge 挂载失败:', error)
  }
} else {
  (window as any).electronAPI = electronAPI  // ❌ any 类型
}
```

**问题**：
- 同时暴露 `electronAPI` 和 `electron` 两个全局变量，造成混淆
- `contextIsolated: false` 时使用 `as any`，破坏类型安全

**修复方案**：只暴露一个统一 API，移除兜底代码

---

### P1-5: CORS 配置过于宽松

**位置**：`backend/main.py:54-60`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ❌ 生产环境危险
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**问题**：CORS 完全开放，存在跨站请求伪造风险

**修复方案**：
```python
allow_origins=[
    "http://127.0.0.1:15387",
    "http://localhost:15387",
    # 生产环境添加 Electron bundle URL
]
```

---

### P1-6: i18n 翻译文件对齐问题

**位置**：`frontend/src/renderer/i18n/locales/`

| 语言 | 总 key 数 | 与 zh-CN 差异 |
|---|---|---|
| zh-CN | 147 | ✅ 基准 |
| en | 140 | ❌ 缺 7 个 |
| vi-VN | 140 | ❌ 缺 7 个 |

**缺失 key**：
- `nav.log`: 运行日志
- `settings.modelLoaded/NotLoaded/Size/RunDevice/WhisperTitle/WhisperHint`

---

### P1-7: 死代码与废弃组件

**发现**：以下组件存在但未在主流程中引用：
- `common/AboutPanel.tsx`
- `common/ActivateModal.tsx`
- `common/LicenseBadge.tsx`
- `common/LogPanel.tsx`

**建议**：确认是否仍在使用，如废弃则从导入链中移除并打标记 `@deprecated`

---

## 🟢 P2 级优化建议

### P2-1: 超大文件需拆分

| 文件 | 行数 | 建议拆分方案 |
|---|---|---|
| `dy_apis/douyin_api.py` | 2,034 | 按协议层拆分（connection, protocol, client） |
| `config_manager.py` | 689 | 分离配置读取/写入/验证逻辑 |
| `call_translation_service.py` | 421 | 提取通话状态机到独立模块 |
| `LocalLLMConfig.tsx` | 285 | 拆分为子组件（模型列表、配置表单、操作按钮） |

---

### P2-2: 重复 API 调用模式

**发现**：多个文件重复相同的 fetch 调用：
```typescript
// 重复出现 4 次
fetch(`${API_BASE}/api/language/get`)
fetch(`${API_BASE}/api/audio/devices`)
```

**建议**：统一迁移到 `services/api.ts` 封装

---

### P2-3: 缺少单元测试

**现状**：零测试覆盖  
**建议优先级**：
1. `translation_service.py` — 翻译引擎单元测试
2. `useWebSocket.ts` — WebSocket 连接逻辑测试
3. `config_manager.py` — 配置持久化测试

---

### P2-4: Tailwind 配置可优化

**现状**：
- `tailwind.config.js` content 扫描路径正确
- `global.css` 已通过 `@config` + `@source` 挂接

**建议**：
- 提取常用组件样式为 `@layer components`
- 添加自定义动画（aurora、slide-in 等）到 `@theme`

---

## 🔐 安全审计结果

| 检查项 | 状态 | 说明 |
|---|---|---|
| 硬编码密钥 | ✅ 通过 | 配置文件仅空字符串占位符 |
| 敏感信息日志 | ✅ 通过 | 未发现 API Key 明文输出 |
| 环境变量使用 | ✅ 正常 | 使用 `os.environ.get()` 安全读取 |
| 外部 URL 硬编码 | ✅ 通过 | 无硬编码外部地址 |
| CORS 配置 | ⚠️ 宽松 | 生产环境需收紧 |
| IPC 安全 | ⚠️ 双变量 | 建议统一暴露 |

---

## 🎨 UI/UX 审计结果

### 已完成的修复（前序工作）
- ✅ Sidebar 底部引擎状态卡去重
- ✅ 按钮扁平化样式（`appearance-none` + `border-none`）
- ✅ Tailwind v4 配置正确加载
- ✅ Bento Grid 布局重构完成（3/9 列）
- ✅ i18n 翻译补全（zh/en/vi 三语对齐）

### 待优化项
- 部分交互元素缺少 `aria-label`
- 加载状态提示不够明确
- 错误边界可覆盖更多场景

---

## 📋 重构优先级与路线图

### 第一阶段（P0 阻塞性修复）— 预计 2 小时

| 任务 | 文件 | 工作量 |
|---|---|---|
| 修复全局 EventEmitter | `useWebSocket.ts` | 30min |
| 统一 API 调用封装 | `services/api.ts` + 各 hook | 45min |
| 清理 preload 冗余 | `preload/index.ts` | 15min |
| 完善依赖探测 | `whisper_service.py` | 10min |

### 第二阶段（P1 稳定性加固）— 预计 4 小时

| 任务 | 文件 | 工作量 |
|---|---|---|
| 重构 OllamaBackend | `llm_service.py` | 30min |
| 统一资源路径解析 | 新增 `utils/path.py` | 20min |
| 音频设备热拔插保护 | `useWebSocket.ts` | 30min |
| CORS 收紧 | `main.py` | 10min |
| 死代码清理 | 多个组件 | 1h |

### 第三阶段（P2 优化）— 预计 8 小时

| 任务 | 文件 | 工作量 |
|---|---|---|
| 拆分 douyin_api.py | `dy_apis/` | 2h |
| 拆分 config_manager.py | `config_manager.py` | 1.5h |
| 补充单元测试 | `tests/` | 3h |
| Tailwind 样式重构 | `global.css` | 1.5h |

---

## 📈 质量指标建议目标

| 指标 | 当前 | 目标 |
|---|---|---|
| 单文件最大行数 | 2,034 (douyin_api.py) | <500 |
| 组件 Props 数量 | 部分 >15 | <10 |
| 圈复杂度 | 部分 >40 | <20 |
| 测试覆盖率 | 0% | >60% |
| TypeScript strict | ✅ true | ✅ |
| any 类型使用 | 3 处 | 0 处 |

---

## ✅ 验证清单

修复完成后请执行以下验证：

```bash
# 1. 类型检查
cd frontend && npx tsc --noEmit

# 2. 构建验证
npm run build

# 3. 后端路由验证
curl http://127.0.0.1:15387/openapi.json | python -m json.tool

# 4. 端到端测试
- 启动应用，确认无白屏
- 连接抖音直播间，验证弹幕流正常
- 切换语言，验证事件不串台
- 拔出声卡，验证优雅降级
```

---

*审计完成时间：2026-09-26*  
*建议按优先级依次修复，每完成一个阶段进行回归测试*
