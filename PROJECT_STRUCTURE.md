# 乐曼同传小助手 - 项目文件结构说明

## 📁 项目根目录
```
D:\001源代码\中越直播小助手\
├── backend/              # Python 后端服务
├── frontend/             # Electron + React 前端应用
├── output/               # 构建输出目录（安装包）
├── build/                # 构建脚本
├── dist/                 # Vite 构建产物
├── README.md             # 项目说明文档
├── backend_engine.spec   # PyInstaller 打包配置
└── build_backend.bat     # 后端打包脚本
```

---

## 🔧 一、后端目录 (backend/)

### 1.1 核心入口
```
backend/
├── main_manager.py       # 后端主入口（FastAPI 服务启动）
├── requirements.txt      # Python 依赖包列表
├── .env.example          # 环境变量模板
└── __pycache__/          # Python 字节码缓存
```

**用途**：
- `main_manager.py` - FastAPI 应用入口，启动 HTTP 服务器（端口 15387）
- 管理 WebSocket 连接、音频采集、翻译服务

---

### 1.2 API 路由层 (backend/app/api/)
```
backend/app/api/
├── routes.py             # API 路由定义（RESTful 接口）
├── websocket.py          # WebSocket 处理（实时字幕推送）
├── dependencies.py       # 依赖注入配置
├── routes/               # 路由模块（可扩展）
└── __pycache__/
```

**用途**：
- `routes.py` - 定义所有 HTTP 接口：
  - `/health` - 健康检查
  - `/api/language/get` - 获取语言配置
  - `/api/tts/status` - TTS 状态
  - `/api/platform/status` - 直播平台状态
  - `/api/call/status` - 通话同传状态
  - `/api/audio/devices` - 音频设备列表

- `websocket.py` - 处理实时翻译 WebSocket 连接
  - 推送 ASR 识别结果
  - 推送翻译文本
  - 推送 TTS 状态

---

### 1.3 服务层 (backend/app/services/)
```
backend/app/services/
├── translation_service.py    # 翻译服务核心（ASR → 翻译 → TTS）
├── tts_service.py            # 文字转语音服务
├── whisper_service.py        # Whisper ASR 语音识别
├── llm_service.py            # LLM 大模型翻译服务
├── call_translation_service.py  # 通话同传服务
├── language_manager.py       # 语言配置管理
└── __pycache__/
```

**用途**：
- `translation_service.py` - 核心翻译流程：音频 → Whisper ASR → Gemini/LLM 翻译 → 文本输出
- `tts_service.py` - Edge TTS 语音合成，将译文转语音播放
- `whisper_service.py` - OpenAI Whisper 语音识别
- `llm_service.py` - LLM 翻译服务（Gemini/Claude 等）
- `call_translation_service.py` - Windows WASAPI 系统音频捕获 + 实时翻译

---

### 1.4 数据采集层 (backend/collectors/)
```
backend/collectors/
├── manager.py              # 采集器管理器（多平台切换）
├── base.py                 # 采集器基类
├── douyin_collector.py     # 抖音直播间采集
├── tiktok_collector.py     # TikTok 直播间采集
└── __pycache__/
```

**用途**：
- 采集直播间弹幕、评论、礼物信息
- 支持抖音、TikTok 等多平台
- 定时轮询 + WebSocket 实时推送

---

### 1.5 抖音 API 集成 (backend/dy_apis/)
```
backend/dy_apis/
└── douyin_api.py           # 抖音开放平台 API 封装
```

**用途**：
- 调用抖音开放平台接口
- 获取直播间实时数据
- 处理 token 刷新、权限验证

---

### 1.6 云端授权服务 (backend/cloud_auth/)
```
backend/cloud_auth/
├── main.py                 # 云端授权 FastAPI 服务
├── test_api.py             # API 测试脚本
├── requirements.txt        # 云端服务依赖
├── .env.example            # 环境变量模板
├── leman_cloud.db          # SQLite 数据库（卡密、日志）
└── __pycache__/
```

**用途**：
- 卡密生成与管理
- 设备激活与绑定
- 心跳校验与授权验证
- Token 消耗统计

**API 接口**：
- `POST /api/admin/login` - 管理员登录
- `POST /api/admin/cards/generate` - 批量生成卡密
- `GET /api/admin/cards/list` - 卡密列表查询
- `GET /api/admin/dashboard/stats` - 看板统计数据
- `POST /api/client/activate` - 客户端激活卡密
- `POST /api/client/heartbeat` - 心跳校验
- `POST /api/client/log_usage` - 记录 Token 消耗

---

### 1.7 工具与配置 (backend/)
```
backend/
├── config_manager.py       # 配置文件管理（config.json）
├── audio_device_manager.py # 音频设备管理
├── prompts/
│   └── vietnam-live.SOUL.md  # 翻译 Prompt 灵魂文件
├── utils/
│   ├── common_util.py      # 通用工具函数
│   └── dy_util.py          # 抖音相关工具
└── static/                 # 静态资源文件
```

---

## 💻 二、前端目录 (frontend/)

### 2.1 前端根目录
```
frontend/
├── package.json            # Node.js 依赖配置
├── vite.config.ts          # Vite 构建配置
├── tsconfig.json           # TypeScript 配置
├── electron-builder.json   # Electron 打包配置
├── tailwind.config.js      # Tailwind CSS 配置
├── postcss.config.js       # PostCSS 配置
├── index.html              # HTML 入口
├── .env                    # 环境变量
└── node_modules/           # 依赖包（不提交）
```

---

### 2.2 主进程 (frontend/src/main/)
```
frontend/src/main/
├── index.ts                # Electron 主进程入口
├── windowManager.ts        # 窗口管理（创建、布局、持久化）
├── autoUpdater.ts          # 自动更新模块
└── preload/                # （子目录，见下文）
```

**用途**：
- `index.ts` - Electron 主进程，管理生命周期、IPC 通信、后端启动
- `windowManager.ts` - 创建主窗口、设置窗口大小、记住位置
- `autoUpdater.ts` - 检查更新、下载更新、安装更新

**关键 IPC 通道**：
- `window:minimize` - 最小化窗口
- `window:close` - 关闭窗口
- `window:toggle-always-on-top` - 置顶切换
- `window:toggle-devtools` - 开发者工具
- `backend:get-url` - 获取后端地址
- `machine:get-id` - 获取机器码
- `update:*` - 更新相关事件

---

### 2.3 Preload 脚本 (frontend/src/preload/)
```
frontend/src/preload/
└── index.ts                # 安全桥接（主进程 ↔ 渲染进程）
```

**用途**：
- 通过 `contextBridge` 暴露安全的 API 给渲染进程
- 防止渲染进程直接访问 Node.js API
- 定义 `ElectronAPI` 接口类型

---

### 2.4 渲染进程 (frontend/src/renderer/)
```
frontend/src/renderer/
├── App.tsx                 # 应用根组件
├── main.tsx                # React 入口
├── global.d.ts             # 全局类型声明
├── components/             # UI 组件
├── hooks/                  # 自定义 Hooks
├── services/               # 服务层
├── i18n/                   # 国际化
├── styles/                 # 样式文件
├── types/                  # TypeScript 类型定义
└── lib/                    # 工具库
```

#### 2.4.1 UI 组件 (components/)
```
frontend/src/renderer/components/
├── Dashboard.tsx           # 主面板（弹幕同传核心）
├── Sidebar.tsx             # 左侧导航栏
├── DanmakuPanel.tsx        # 弹幕显示面板
├── SettingsPanel.tsx       # 设置面板容器
├── AudioSpectrum.tsx       # 音频频谱可视化
├── LogPanel.tsx            # 日志面板
├── AboutPanel.tsx          # 关于面板
├── ActivateModal.tsx       # 卡密激活弹窗
├── LicenseBadge.tsx        # 授权状态徽章
├── BusinessDashboard.tsx   # 运营看板（商业管理界面）
├── settings/               # 设置子组件
│   ├── ApiKeysConfig.tsx   # API Key 配置
│   ├── AudioDevicesConfig.tsx  # 音频设备配置
│   ├── LanguageConfig.tsx  # 语言配置
│   ├── LocalLLMConfig.tsx  # 本地 LLM 配置
│   └── WhisperConfig.tsx   # Whisper 配置
└── ui/                     # 基础 UI 组件（shadcn/ui）
    ├── button.tsx
    ├── input.tsx
    ├── select.tsx
    ├── dialog.tsx
    ├── badge.tsx
    └── toast-container.tsx
```

**用途**：
- `Dashboard.tsx` - 核心业务界面，包含所有功能模块
- `Sidebar.tsx` - 左侧导航，切换不同功能模块
- `ActivateModal.tsx` - 卡密激活弹窗，显示机器码、输入激活码
- `LicenseBadge.tsx` - Header 右上角显示授权状态
- `BusinessDashboard.tsx` - 运营看板，显示统计数据、图表

#### 2.4.2 自定义 Hooks (hooks/)
```
frontend/src/renderer/hooks/
├── useWebSocket.ts         # WebSocket 连接管理
├── usePlatform.ts          # 直播平台状态管理
└── use-toast.tsx           # Toast 提示 Hook
```

**用途**：
- `useWebSocket.ts` - 管理 WebSocket 连接、重连逻辑、消息处理
- `usePlatform.ts` - 管理抖音/TikTok 平台连接状态
- `use-toast.tsx` - 显示成功/错误/信息提示

#### 2.4.3 服务层 (services/)
```
frontend/src/renderer/services/
├── api.ts                  # API 请求封装
└── auth.ts                 # 授权服务（机器码、激活、心跳）
```

**用途**：
- `api.ts` - 封装所有后端 API 调用（fetch/axios）
- `auth.ts` - 授权管理：
  - `getMachineId()` - 获取本机唯一机器码
  - `activateCard()` - 激活卡密
  - `heartbeat()` - 心跳校验
  - `startHeartbeat()` - 启动静默心跳（每5分钟）
  - `getAuthState()` - 获取授权状态
  - `checkNeedActivation()` - 检查是否需要激活

#### 2.4.4 国际化 (i18n/)
```
frontend/src/renderer/i18n/
├── index.ts                # i18next 配置
└── locales/
    ├── zh-CN/              # 中文语言包
    ├── vi-VN/              # 越南语语言包
    └── en/                 # 英语语言包
```

**用途**：
- 支持中、越、英三语切换
- 所有界面文本国际化

#### 2.4.5 样式与类型 (styles/ & types/)
```
frontend/src/renderer/
├── styles/
│   └── global.css          # 全局样式（Tailwind + 自定义）
└── types/
    └── index.ts            # TypeScript 类型定义
```

---

## 📦 三、构建输出目录

### 3.1 开发构建 (frontend/dist-electron/)
```
frontend/dist-electron/
├── main/
│   └── index.js            # 主进程打包文件（CommonJS）
└── preload/
    └── index.js            # Preload 脚本打包文件
```

**用途**：
- Vite 编译后的 Electron 主进程代码
- 打包体积约 270KB

---

### 3.2 生产构建 (frontend/dist/)
```
frontend/dist/
├── index.html              # HTML 入口
└── assets/
    ├── index-*.js          # React 应用打包文件
    └── index-*.css         # 样式文件
```

**用途**：
- Vite 编译后的前端应用资源
- 供 Electron 加载显示

---

### 3.3 安装包输出 (output/)
```
output/
├── 乐曼同传小助手 Setup 0.1.1.exe  # NSIS 安装包
├── 乐曼同传小助手 Setup 0.1.1.exe.blockmap  # 更新校验文件
├── win-unpacked/           # 解压后的应用目录
│   ├── 乐曼同传小助手.exe  # 主程序
│   ├── resources/          # 应用资源
│   └── dist-electron/      # Electron 代码
├── backend_engine/         # Python 后端打包文件
│   └── backend_engine.exe  # PyInstaller 打包的后端
└── latest.yml              # 更新配置文件
```

**用途**：
- `output/乐曼同传小助手 Setup 0.1.1.exe` - 用户安装程序
- `output/backend_engine/` - 内嵌的后端引擎

---

### 3.4 安装目录
```
C:\Users\k9831\AppData\Local\Programs\leman-translate\
├── 乐曼同传小助手.exe      # 主程序
├── resources/
│   ├── app/               # 应用资源
│   └── dist-electron/     # Electron 代码
└── ...
```

---

## 🔄 四、数据流向

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron 桌面应用                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Dashboard  │←──→│  Sidebar    │←──→│  Settings   │     │
│  │  (主界面)   │    │  (导航栏)   │    │  (设置)     │     │
│  └──────┬──────┘    └─────────────┘    └─────────────┘     │
│         │                                                   │
│  ┌──────▼──────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  WebSocket  │────│  API 服务   │────│  云端授权   │     │
│  │  (实时字幕) │    │  (15387)    │    │  (8000)     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Python 后端服务                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  翻译服务   │    │  采集服务   │    │  音频服务   │     │
│  │  (ASR+LLM)  │    │  (抖音/TikTok)│   │  (WASAPI)   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 五、关键配置文件

| 文件 | 用途 |
|------|------|
| `backend/main_manager.py` | 后端 FastAPI 主入口 |
| `frontend/src/main/index.ts` | Electron 主进程入口 |
| `frontend/src/renderer/components/Dashboard.tsx` | 主界面组件 |
| `frontend/src/renderer/services/auth.ts` | 授权服务逻辑 |
| `backend/cloud_auth/main.py` | 云端授权服务 |
| `backend/prompts/vietnam-live.SOUL.md` | 翻译 Prompt |
| `frontend/package.json` | Node.js 依赖配置 |
| `frontend/vite.config.ts` | Vite 构建配置 |

---

## 🚀 六、启动命令

```bash
# 1. 启动后端引擎（端口 15387）
cd backend && python main_manager.py

# 2. 启动云端授权服务（端口 8000）
cd backend/cloud_auth && python main.py

# 3. 启动 Vite 开发服务器（端口 5173）
cd frontend && npm run dev

# 4. 启动完整 Electron 应用（开发者模式）
cd frontend && npm run electron:dev

# 5. 构建生产版本
cd frontend && npm run build
```
