# 喜阅 TransFlow · 跨语言智能直播同传工作台 — 技术架构文档

> 生成时间：2026-09-29  
> 项目路径：`D:\软件开发\中越直播小助手`  
> Git 远端：`https://github.com/Gary-96/XiYue-TransFlow`

---

## 一、总体架构概览

```
喜阅 TransFlow
├── backend/                  Python FastAPI 后端（端口 15387）
│   ├── main.py               入口，固定端口 15387
│   ├── config_manager.py     配置单例代理层（向后兼容）
│   ├── requirements.txt      依赖声明
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes.py     REST 路由组（翻译/音频/语言/TTS/通话/平台/LLM）
│   │   │   ├── websocket.py  WebSocket 路由（/ws/stream, /ws/audio）
│   │   │   └── dependencies.py  依赖注入
│   │   ├── core/base.py      BaseService 基类
│   │   ├── models/schemas.py  Pydantic 模型（前后端契约）
│   │   └── services/
│   │       ├── whisper_service.py      ASR（Faster-Whisper）
│   │       ├── translation_service.py  翻译（Gemini/OpenAI）
│   │       ├── tts_service.py          TTS（edge-tts）
│   │       ├── call_translation/       通话同传模块
│   │       └── language_manager.py     语言对管理
│   ├── collectors/             弹幕采集器（抖音/TikTok）
│   ├── config/                 配置子模块（audio/keys/local_llm/base）
│   ├── dy_apis/                抖音协议封装
│   └── tests/                  单元测试（pytest）
│
├── frontend/                   Electron + React 19 + TypeScript
│   ├── app/                    渲染进程源码
│   │   ├── app.tsx             根组件（Dashboard 布局）
│   │   ├── renderer.tsx        ReactDOM 入口
│   │   ├── components/ui/      shadcn/ui 原子组件
│   │   ├── shell/              窗口框架（Titlebar/Theme/Window）
│   │   ├── features/           业务功能组件
│   │   │   ├── dashboard/      主布局（Sidebar + TopHeader + MainView）
│   │   │   ├── danmaku/        弹幕流列表
│   │   │   ├── subtitle/       字幕视口 + 音频频谱
│   │   │   └── settings/       设备与大模型配置
│   │   ├── hooks/              React Hooks
│   │   │   └── useWebSocket.ts 双 WebSocket 通信 Hook
│   │   ├── services/           API 封装
│   │   │   └── api.ts          HTTP 接口（自动 Bearer token 注入）
│   │   ├── types/              统一类型定义
│   │   │   └── index.ts        StreamMessage/AudioTranscription/ConnectionStatus 等
│   │   └── styles/globals.css  Tailwind v4 + Zinc 暗黑系设计 Token
│   ├── lib/
│   │   ├── main/               主进程源码
│   │   └── preload/            预加载脚本
│   ├── conveyor/               electron-conveyor IPC 框架
│   ├── electron.vite.config.ts 构建配置（main/preload/renderer 三目标）
│   ├── tsconfig.web.json       Web TS 配置（moduleResolution: bundler）
│   ├── tsconfig.node.json      Node TS 配置
│   ├── package.json            xiyue-transflow@2.0.0
│   └── electron-builder.yml    打包配置（appId: com.xiyue.transflow）
│
└── docs/
    └── reports/                历史审计归档（保留，不再新增临时报告）
```

---

## 二、通信契约规范

### 2.1 WebSocket 路由

| 路由 | 方向 | 用途 | 状态 |
|------|------|------|------|
| `/ws/stream` | Server→Client | 弹幕流推送（comment/gift/member_join/social/system） | 🟡 连接建立，待接入 collector |
| `/ws/audio` | Client↔Server | 音频 PCM 流双向传输（ASR → 翻译 → TTS） | 🟡 连接建立，待接入 whisper_service |

### 2.2 消息契约（前端 `frontend/app/types/index.ts`）

```typescript
// 弹幕消息
interface StreamMessage {
  type: 'comment' | 'gift' | 'member_join' | 'social' | 'system'
  user: string
  text: string
  translated_text?: string
  gift_name?: string
  gift_count?: number
  language?: string
  timestamp?: number
}

// 音频转录结果
interface AudioTranscription {
  timestamp: number
  source_text: string
  target_text: string
}

// 连接状态
interface ConnectionStatus {
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
  ping_ms?: number
}

// WebSocket 消息联合类型
type WebSocketMessage =
  | ConnectionMessage
  | PingMessage
  | PongMessage
  | LanguageChangedMessage
  | VoiceChangedMessage
  | StreamMessage
```

### 2.3 HTTP API 端点（FastAPI 15387 端口）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/audio/devices` | 列出音频设备 |
| POST | `/api/audio/device` | 设置默认输入设备 |
| GET | `/api/language/current` | 查询当前语言对 |
| PUT | `/api/language/set` | 设置语言对 |
| POST | `/api/translate` | 触发文本翻译 |
| GET | `/api/tts/status` | TTS 开关状态 |
| PUT | `/api/tts/enable` | 启用/禁用 TTS |
| POST | `/api/call/start` | 启动通话同传 |
| POST | `/api/call/stop` | 停止通话同传 |
| GET | `/api/local-llm/status` | 本地 LLM 状态（Ollama） |
| GET | `/api/local-llm/models` | 列出 Ollama 模型 |
| POST | `/api/local-llm/pull` | 拉取 Ollama 模型 |
| PUT | `/api/local-llm/config` | 保存本地 LLM 配置 |

### 2.4 授权激活接口（待实现）

- `POST /api/client/activate` — 卡密验证 → 写入 license → 返回激活状态
- 前端通过 `services/api.ts` 的 `activateLicense()` 调用

---

## 三、双主题系统规范

### 3.1 设计 Token（Tailwind v4 CSS 变量）

所有组件必须使用语义化 Token，**严禁硬编码颜色值**。

| Token 变量 | 深色模式值 | 浅色模式值 | 用途 |
|------------|-----------|-----------|------|
| `--background` | `#08090a` | `#f4f2ef` | 页面底色 |
| `--foreground` | `#f2f3f3` | `#14100e` | 主文字颜色 |
| `--muted-foreground` | `#a3aaad` | `#5f5952` | 次级/说明文字 |
| `--border` | `#212527` | `e2ded8` | 边框颜色 |
| `--card` | `#0e1011` | `#fffefc` | 卡片底色 |
| `--accent` | `#1a1b1e` | `#ebe8e3` | 悬浮/强调背景 |
| `--accent-foreground` | `#f2f3f3` | `#14100e` | 强调文字 |
| `--primary` | `#6366f1` | `#6366f1` | 品牌主色（靛蓝） |
| `--primary-foreground` | `#ffffff` | `#ffffff` | 主色文字 |
| `--destructive` | `#ef4444` | `#ef4444` | 危险操作色 |

### 3.2 语义化类名替换规则

| 旧（硬编码） | 新（语义 Token） | 适用场景 |
|-------------|-----------------|----------|
| `text-white` | `text-foreground` | 主文字 |
| `text-white/60~80` | `text-muted-foreground` | 次级/说明文字 |
| `border-white/10` | `border-border` | 边框 |
| `bg-white/[0.03]~[0.05]` | `bg-card` / `bg-muted/40` | 卡片背景 |
| `hover:bg-white/5` | `hover:bg-accent` | 悬停背景 |
| `hover:text-white` | `hover:text-accent-foreground` | 悬停文字 |
| `bg-white/10`（侧边栏激活） | `bg-primary/10 text-primary` | 激活态 |
| `text-emerald-400` | `text-emerald-500` | 成功状态（更中性） |
| `text-indigo-300` | `text-indigo-500` | 翻译文字（更中性） |

### 3.3 保留的硬编码白色

以下情况保留 `text-white`（功能需要，非主题依赖）：

- 蓝色按钮（`bg-indigo-600`）上的白色文字，符合 WCAG 对比度要求

---

## 四、前后端服务端口规范

| 服务 | 端口 | 说明 |
|------|------|------|
| FastAPI 后端 | `15387` | 固定端口，禁止自动递增 |
| Vite dev server | `5177` | 前端开发服务器（`npm run dev`） |
| Electron 渲染进程 | `:5177` 代理 | Vite HMR 热更新 |

### 4.1 后端启动命令

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 15387 --reload
```

### 4.2 前端启动命令

```bash
cd frontend
npm install
npm run dev
```

### 4.3 Windows 打包命令

```bash
cd frontend
npm run build:win
# 输出至: frontend/dist/win-unpacked/
```

---

## 五、业务组件架构

### 5.1 主布局（Dashboard 三栏）

```
┌─────────────────────────────────────────────────────────────┐
│  Titlebar（喜阅 TransFlow · 品牌徽章 · 主题切换 · 窗口控制）  │
├──────────┬────────────────────────────────┬─────────────────┤
│          │                                │                 │
│ Sidebar  │       MainView                 │  SubtitlePanel  │
│          │  ┌─────────┬─────────┬───────┐ │               │
│ • 直播同传│  │ Metric  │ 弹幕流  │ 频谱  │ │ 双语字幕      │
│ • 通话同传│  │ Card    │ Panel   │       │ │ （原文+译文）  │
│ • 配置    │  └─────────┴─────────┴───────┘ │               │
│          │  ┌───────────────────────────┐  │                 │
│          │  │ 底部控制栏（识别/清空/设置）│  │                 │
│          │  └───────────────────────────┘  │                 │
└──────────┴────────────────────────────────┴─────────────────┘
```

### 5.2 状态管理

- **Zustand Store**：`useWindowStore`（窗口状态）、`useThemeStore`（主题切换）
- **React Hooks**：`useWebSocket`（弹幕流 + 音频流双连接）、`useAudioStream`（麦克风采集）
- **TanStack Query**：REST API 数据缓存与自动刷新

---

## 六、工程检查清单

### 6.1 TypeScript 检查

```bash
cd frontend && npm run typecheck
# 预期输出：exit 0，零错误
```

### 6.2 路径别名映射（已配置）

```json
// tsconfig.web.json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./*"],
      "@/types": ["app/types"],
      "@/hooks/*": ["app/hooks/*"],
      "@/services/*": ["app/services/*"],
      "@/features/*": ["app/features/*"],
      "@/components/*": ["app/components/*"],
      "@/shell": ["app/shell"]
    }
  }
}
```

### 6.3 Vite 别名配置

```ts
// electron.vite.config.ts
renderer: {
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'app')
    }
  }
}
```

---

## 七、品牌元数据

| 配置项 | 值 |
|--------|-----|
| 产品名 | 喜阅 TransFlow |
| NPM 包名 | `xiyue-transflow` |
| 版本 | `2.0.0` |
| AppID | `com.xiyue.transflow` |
| 可执行文件名 | `喜阅 TransFlow` |
| 版权 | © 2026 Gary-96 · 喜阅 TransFlow |

---

## 八、Git 提交规范

```bash
# 提交前确保 git identity
git config user.name "Gary-96"
git config user.email "gary-96@users.noreply.github.com"

# 提交
git add -A
git commit -m "feat: 描述变更内容"
```

---

*文档版本：v1.0 · 最后更新：2026-09-29*
