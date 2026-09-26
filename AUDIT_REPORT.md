# 乐曼同传小助手 — 工程质量综合审计报告

> 审计时间：2026-09-26  
> 审计范围：frontend/src/ + backend/  
> 审计维度：代码复用、死代码、安全、复杂度、架构

---

## 📊 工程概况

| 维度 | 指标 |
|---|---|
| 后端 Python 文件 | 37 个，约 7,849 行 |
| 前端 TS/TSX 文件 | 37 个，约 4,716 行 |
| 总代码规模 | ~12,500 行业务代码 |
| Git 提交历史 | 6 个正式 commit |
| 依赖管理 | pip requirements.txt + npm package.json |

---

## 🔴 P0 级严重缺陷（阻塞核心功能）

### P0-1: 全局 EventEmitter 跨窗口状态污染
**位置**：`frontend/src/renderer/hooks/useWebSocket.ts:40`

```typescript
// 模块级全局单例 — 多窗口模式下所有实例共享同一 eventEmitter
const eventEmitter = new EventEmitter()
```

**问题**：
- 多窗口（主控台 + 字幕悬浮窗）同时运行时，语言切换事件会广播给所有实例
- 弹幕消息会被多个窗口重复接收
- 无独立作用域隔离

**修复方案**：改用 React Context 或每个 hook 实例持有独立 EventEmitter

---

### P0-2: OllamaBackend.is_available 在异步上下文调用崩溃
**位置**：`backend/app/services/llm_service.py:299`

```python
def get_status(self) -> Dict[str, Any]:
    return {
        "ollama_available": self._get_ollama().is_available,  # ❌ 同步属性访问
        # ...
    }
```

**问题**：
- `is_available` 内部检测运行中的 asyncio 事件循环
- FastAPI 路由调用时会抛出 `RuntimeError: Cannot run the event loop while another loop is running`
- 导致 `/api/local-llm/status` 接口 500 错误

**当前临时防护**（不完整）：
```python
@property
def is_available(self) -> bool:
    try:
        loop = asyncio.get_running_loop()
        raise RuntimeError("...")  # 抛出自定义异常
    except RuntimeError as e:
        if "不能在异步上下文调用" in str(e):
            raise
        return asyncio.get_event_loop().run_until_complete(self._check_health())
```

**正确修复**：改为 `async def is_available()` 并在调用处用 `await`

---

### P0-3: i18n 翻译文件缺失 7 个 key
**位置**：`frontend/src/renderer/i18n/locales/`

```
zh-CN: 147 keys
en:    140 keys ❌ (缺 7)
vi-VN: 140 keys ❌ (缺 7)
```

**缺失 key**：
- `nav.log`: 运行日志
- `settings.modelLoaded`: 已加载
- `settings.modelNotLoaded`: 未加载
- `settings.modelSize`: 模型大小
- `settings.runDevice`: 运行设备
- `settings.whisperHint`: 提示文本
- `settings.whisperTitle`: 语音识别引擎

**影响**：英文/越南语界面显示裸 key 名

---

## 🟡 P1 级稳定性隐患

### P1-1: 死代码 — 12 个未使用组件
**文件清单**：
- `AboutPanel.tsx` — 可能是废弃的关于页面
- `ActivateModal.tsx` — 激活弹窗（可能已替换为其他实现）
- `LicenseBadge.tsx` — 授权徽标
- `LogPanel.tsx` — 日志面板
- `ui/badge.tsx`, `ui/button.tsx`, `ui/dialog.tsx`, `ui/input.tsx`, `ui/select.tsx` — UI 基础组件（可能有替代实现）

**建议**：确认是否仍被引用，如废弃则删除或标记 `@deprecated`

---

### P1-2: 重复 API 调用模式
**重复路径**（被多文件重复使用）：
- `/health` → `usePlatform.ts`, `WhisperConfig.tsx`
- `/api/language/get` → `useDashboardLogic.ts`, `LanguageConfig.tsx`
- `/api/audio/devices` → `useDashboardLogic.ts`, `AudioDevicesConfig.tsx`
- `/api/language/set` → `useDashboardLogic.ts`, `LanguageConfig.tsx`

**现状**：已有 `services/api.ts` 封装了通用 GET/POST/PUT，但部分代码仍直接用 `fetch`

**建议**：统一迁移到 `apiGet()` / `apiPost()` 封装

---

### P1-3: 超大文件需要拆分
**文件复杂度排名**：
| 文件 | 行数 | 问题 |
|---|---|---|
| `dy_apis/douyin_api.py` | 2,034 | 单一文件过长，职责不清晰 |
| `config_manager.py` | 689 | 配置逻辑与路径解析耦合 |
| `call_translation_service.py` | 421 | 通话翻译逻辑混杂 |
| `LocalLLMConfig.tsx` | 285 | 前端组件过重 |
| `ApiKeysConfig.tsx` | 318 | 设置面板过大 |

**建议**：按单一职责原则拆分

---

### P1-4: Whisper 依赖探测逻辑不完整
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

## 🟢 安全审计结果

| 检查项 | 状态 | 说明 |
|---|---|---|
| 硬编码密钥 | ✅ 通过 | 配置文件仅空字符串占位符 |
| 敏感信息日志 | ✅ 通过 | 未发现 API Key 明文输出 |
| 环境变量使用 | ℹ️ 正常 | 使用 `os.environ.get()` 安全读取 |
| 外部 URL 硬编码 | ✅ 通过 | 无硬编码外部地址 |
| CORS 配置 | ⚠️ 宽松 | `allow_origins=["*"]` 生产环境需收紧 |

---

## 🎨 UI/UX 问题

### 已修复（本次前序工作）
- ✅ Sidebar 底部引擎状态卡去重
- ✅ 按钮扁平化样式 (`appearance-none`, `border-none`)
- ✅ Tailwind v4 配置正确加载
- ✅ Bento Grid 布局重构完成

### 待优化
- 部分交互元素缺少 `aria-label`
- 加载状态提示不够明确
- 错误边界可覆盖更多场景

---

## 📋 修复优先级建议

| 优先级 | 任务 | 预计工时 | 影响范围 |
|---|---|---|---|
| P0-1 | 修复 EventEmitter 全局单例 | 30min | 多窗口场景 |
| P0-2 | 修复 `is_available` 异步调用 | 15min | 本地 LLM 状态检查 |
| P0-3 | 补全 i18n 翻译 | 20min | 国际化用户体验 |
| P1-1 | 清理死代码 | 1h | 代码维护性 |
| P1-2 | 统一 API 调用封装 | 1h | 代码一致性 |
| P1-3 | 拆分超大文件 | 4h | 可维护性 |
| P1-4 | 完善依赖探测 | 15min | 启动诊断 |

---

## 📈 质量指标建议目标

| 指标 | 当前 | 目标 |
|---|---|---|
| 单文件最大行数 | 2,034 (douyin_api.py) | <500 |
| 组件 Props 数量 | 部分 >15 | <10 |
| 圈复杂度 | 部分 >40 | <20 |
| 测试覆盖率 | 0% | >60% |
| TypeScript 严格模式 | strict: true | ✅ 已开启 |

---

*审计完成。建议按优先级依次修复，每完成一项进行单元测试验证。*
