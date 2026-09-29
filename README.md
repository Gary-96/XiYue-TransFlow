# 喜阅 TransFlow

**喜阅 TransFlow · 跨语言智能直播同传桌面工作台**

基于 Electron + FastAPI 构建的中越双语实时直播同传工具，支持抖音/TikTok 弹幕采集、音频实时 ASR 转录、AI 翻译与 TTS 语音合成，为跨境直播主播提供低延迟的双语字幕与语音辅助。

---

## 技术架构

| 层级 | 技术栈 |
|------|--------|
| 桌面框架 | Electron 31 + React 19 + TypeScript |
| 样式系统 | Tailwind CSS v4 + shadcn/ui（双主题 Zinc 暗黑系） |
| 状态管理 | Zustand + TanStack Query |
| IPC 桥接 | electron-conveyor（类型安全） |
| 后端引擎 | Python 3.11 + FastAPI（端口 15387） |
| AI 服务 | Faster-Whisper（ASR）、Gemini/OpenAI（翻译）、edge-tts（语音合成） |
| 弹幕采集 | 抖音/TikTok WebSocket 协议 |

---

## 核心功能

- **实时弹幕接入**：抖音 / TikTok 直播间弹幕 WebSocket 流式接收，自动解析评论、礼物、会员等事件
- **双语即时翻译**：AI 驱动的中 → 越、中 → 英等多语言对实时翻译
- **音频流式转录**：麦克风 PCM 流 → Faster-Whisper ASR → 翻译 → 字幕展示
- **TTS 语音合成**：edge-tts 自动朗读翻译文本，多声音设备支持
- **通话同传**：支持电话/语音通话场景的双语实时转译
- **双主题适配**：Light / Dark 模式无缝切换，语义化 Design Token 全量覆盖

---

## 本地开发启动

### 前置依赖

```bash
# Python 3.11+
python --version

# Node.js 18+
node --version && npm --version
```

### 后端启动（FastAPI · 端口 15387）

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 15387 --reload
```

后端就绪后访问 `http://127.0.0.1:15387/docs` 查看 OpenAPI 文档。

### 前端启动（Electron Dev Server · 端口 5177）

```bash
cd frontend
npm install
npm run dev
```

Vite dev server 运行于 `:5177`，Electron 主进程自动加载渲染进程。

---

## 打包部署

### Windows 安装包

```bash
cd frontend
npm run build:win
# 输出至: frontend/dist/win-unpacked/
```

### macOS DMG

```bash
npm run build:mac
```

### Linux AppImage

```bash
npm run build:linux
```

---

## 项目结构

```
中越直播小助手/
├── backend/                  # FastAPI 后端引擎
│   ├── main.py               # 入口（端口 15387）
│   ├── app/api/              # REST + WebSocket 路由
│   ├── app/services/         # ASR / 翻译 / TTS 服务
│   ├── collectors/           # 弹幕采集器（抖音/TikTok）
│   ├── config/               # 配置子模块
│   └── tests/                # pytest 单元测试
│
├── frontend/                 # Electron + React 桌面端
│   ├── app/                  # 渲染进程源码
│   │   ├── features/         # 业务组件（dashboard/danmaku/subtitle/settings）
│   │   ├── hooks/            # useWebSocket 等
│   │   ├── services/         # API 封装
│   │   ├── types/            # 统一类型定义
│   │   ├── shell/            # 窗口框架（Titlebar/Theme）
│   │   └── components/ui/    # shadcn/ui 原子组件
│   ├── lib/main/             # 主进程
│   ├── lib/preload/          # 预加载脚本
│   └── conveyor/             # IPC 通信桥
│
└── docs/
    └── ARCHITECTURE.md       # 技术架构文档
```

---

## 配置说明

后端配置文件位于 `backend/config/` 目录，默认空值占位。首次使用前需配置：

- **Gemini API Key**：`config.yaml` → `gemini.api_key`
- **OpenAI API Key**：`config.yaml` → `openai.api_key`
- **音频设备**：通过 UI「设置」面板选择输入设备
- **Ollama 本地模型**：可选，需本地运行 `ollama serve`

---

## License

MIT © 2026 Gary-96 · 喜阅 TransFlow
