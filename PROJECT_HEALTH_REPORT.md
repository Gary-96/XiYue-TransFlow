# 乐曼同传小助手 — 项目体检报告

> 生成时间：2026-09-26  
> 版本：0.1.1 | 后端架构：v2 (voicebox-style)  
> 分支：main → origin/main (up to date)

---

## 一、项目概览

| 维度 | 详情 |
|---|---|
| **定位** | 中越跨境直播实时同声传译桌面工具 |
| **双平台** | 抖音（WebSocket + PB 协议）+ TikTok（TikTokLive v6） |
| **技术栈** | React 18 + TypeScript + Vite + Tailwind v4 + Electron |
| **后端** | FastAPI + faster-whisper + Edge TTS + 多翻译引擎 |
| **架构风格** | Voicebox 风格：分层路由 + 依赖注入 + 懒加载 |
| **代码规模** | 后端 27 个 .py，前端 38 个组件/hook，总计约 2,400 行业务代码 |
| **前端依赖** | node_modules 670MB（含 Electron/React 全量） |

---

## 二、P0 级缺陷（需立即修复）

### P0-1: Whisper 模型依赖未安装 → 语音转写完全失效
**位置**：`backend/requirements.txt` + `backend/app/services/whisper_service.py`

```
requirements.txt 包含 faster-whisper==0.10.0，但当前环境未安装 torch/torchaudio
导致 WhisperService.transcribe_audio() 永远返回 None
```

**影响**：主播语音识别功能不可用，核心场景断裂  
**修复建议**：
```bash
cd backend && pip install -r requirements.txt
# 或手动安装核心依赖：
pip install torch torchaudio faster-whisper
```

---

### P0-2: 全局事件发射器造成跨组件状态污染风险
**位置**：`frontend/src/renderer/hooks/useWebSocket.ts:23-42`

```typescript
const eventEmitter = new EventEmitter()  // 模块级全局单例

export function useStreamWebSocket() {
  // ... 多个 hook 实例共享同一个 eventEmitter
  eventEmitter.emit(WS_EVENTS.LANGUAGE_CHANGED, ...)
}
```

**问题**：若页面同时挂载多个 Dashboard 实例（如多窗口模式），语言切换事件会广播给所有实例，导致状态混乱。  
**修复建议**：改用 React Context 或每个 hook 实例持有独立的 EventEmitter。

---

## 三、P1 级缺陷（重要，影响稳定性）

### P1-1: LLM 后端健康检查可能阻塞事件循环
**位置**：`backend/app/services/llm_service.py:63-68`

```python
@property
def is_available(self) -> bool:
    return asyncio.get_running_loop().run_until_complete(self._check_health())
    # ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    # 在异步上下文中调用 run_until_complete 会抛出 RuntimeError
```

**触发条件**：OllamaBackend 被 FastAPI 路由直接调用时  
**修复建议**：
```python
@property
async def is_available(self) -> bool:  # 改为 async
    return await self._check_health()
```

---

### P1-2: 打包路径假设脆弱
**位置**：`backend/app/services/whisper_service.py:38-44`

```python
elif sys._MEIPASS:
    model_dir = os.path.join(sys._MEIPASS, "models", "faster-whisper")
    if not os.path.exists(model_dir):
        model_dir = None  # 回退到默认缓存路径
```

**问题**：PyInstaller 打包后 `sys._MEIPASS` 指向临时解压目录，但模型通常不会打入包内。当前逻辑会静默失败并回退到 `~/.cache/faster-whisper`，但未告知用户模型下载失败。  
**修复建议**：在回退时记录 warning 日志并向上层传递明确错误。

---

### P1-3: 前端 i18n 文件不同步
**位置**：`frontend/src/renderer/i18n/locales/`

| 语言 | 条数 | 差异 |
|---|---|---|
| zh-CN | 161 | 基准 |
| en | 154 | 缺 7 条 |
| vi-VN | 154 | 缺 7 条 |

**影响**：部分 UI 文本在英文/越南语下显示 key 而非翻译  
**修复**：对齐翻译文件，补全缺失 key。

---

## 四、P2 级建议（优化项）

### P2-1: 缺少统一鉴权中间件
**现状**：`backend/app/api/dependencies.py` 已定义依赖注入，但路由层未显式调用鉴权装饰器。  
**建议**：在 `register_routes()` 中添加 `APIRouter(dependencies=[Depends(check_auth)])` 类守卫。

### P2-2: 前端类型断言过多
**位置**：`frontend/src/renderer/hooks/useWebSocket.ts:85-90`

```typescript
const msg = parsed as Exclude<WebSocketMessage, CallSubtitle> & { ... }
```

建议引入 Zod/Valibot 运行时校验，替代类型断言。

### P2-3: 无自动化测试覆盖
**现状**：整个仓库无 `test/` 目录，无 pytest/vitest 配置。  
**建议**：至少为 `translation_service.py` 和 `useWebSocket.ts` 补充单元测试。

### P2-4: TTS 音色元数据冗余
**位置**：`backend/app/services/tts_service.py:13-80`

`DEFAULT_VOICES` 与 `EDGE_VOICE_META` 存在重复映射，可合并为单一数据源。

---

## 五、架构亮点

✅ **懒加载设计**：Whisper/TTS/翻译服务均在首次调用时才加载模型，启动速度 2-4s  
✅ **错误边界**：React ErrorBoundary 防止子组件崩溃导致黑屏  
✅ **双通道 WebSocket**：`/ws/stream`（弹幕）与 `/ws/audio`（语音）分离，互不干扰  
✅ **模块化 collector**：BaseCollector ABC + 平台实现解耦  
✅ **Tailwind v4 配置正确**：`@config` + `@source` 指令已挂接，utility classes 编译正常  

---

## 六、待提交变更清单

```
 M frontend/src/renderer/App.tsx              # P0 去重修复
 M frontend/src/renderer/components/Dashboard.tsx   # 重构（97 行）
 M frontend/src/renderer/components/Sidebar.tsx     # 去重底部状态卡
 M frontend/src/renderer/styles/global.css          # 表单控件基线规范化
 M frontend/tailwind.config.js                    # content 路径收紧
?? frontend/src/renderer/components/dashboard/   # 新增子组件目录
```

---

## 七、下一步行动建议

| 优先级 | 行动 | 预计耗时 |
|---|---|---|
| P0-1 | 安装后端依赖 `pip install -r requirements.txt` | 5 分钟 |
| P1-1 | 修复 `is_available` 为 async | 10 分钟 |
| P1-3 | 对齐 i18n 翻译文件 | 15 分钟 |
| P2-3 | 补充核心服务单元测试 | 2-3 小时 |
| — | 提交当前变更到 git | 5 分钟 |

---

*报告生成完毕。如需深度排查某一项，请告知。*
