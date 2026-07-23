<div align="center">

# 🎙️ 乐曼同传小助手

### 中越直播实时同声传译工具

支持 **抖音** + **TikTok** 双平台弹幕采集与中越双语互译

[![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 📖 项目简介

乐曼同传小助手是一款面向中越跨境直播的实时同声传译桌面应用。通过 AI 语音识别 + 机器翻译，实现主播语音和观众弹幕的实时双语转换，帮助跨境主播轻松应对多语言直播场景。

### 核心能力

| 功能 | 说明 |
|------|------|
| 🎤 **语音实时翻译** | 主播语音 → faster-whisper 转录 → 多服务商翻译（Gemini / Groq / DeepSeek / OpenAI） |
| 💬 **弹幕实时翻译** | 抖音 / TikTok 弹幕自动采集 + 实时翻译显示 |
| 🔍 **三语自动检测** | 中文 / 越南语 / 英语智能识别，无需手动切换 |
| 🎛️ **声卡设备管理** | 自动枚举专业输入设备，支持运行时动态切换 |
| 📊 **实时音频频谱** | FFT 频谱可视化（Hanning 窗 + 20 频段对数分布 + Peak Hold） |
| 🔊 **TTS 语音合成** | Edge TTS 预设音色，支持自定义音色 |
| 🔄 **自动更新** | 内置 electron-updater，支持 GitHub Release 一键升级 |
| 🪟 **多窗口模式** | 主控台 + 系统置顶 + OBS 绿幕窗口 |

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────┐
│                  Electron 主进程                  │
│   后端自启 · 健康检查 · 自动重启 · 多窗口管理      │
├──────────────────────┬──────────────────────────┤
│   preload (IPC桥接)   │    autoUpdater (自动更新)  │
├──────────────────────┴──────────────────────────┤
│              React 渲染层 (Dashboard)             │
│  ┌──────────┬───────────┬──────────┬──────────┐ │
│  │ 弹幕面板  │ 字幕历史   │ 设置面板  │ 音频频谱 │ │
│  └──────────┴───────────┴──────────┴──────────┘ │
├─────────────────────────────────────────────────┤
│           WebSocket 双通道 + REST API             │
│    /ws/stream (弹幕)    /ws/audio (语音+频谱)      │
├─────────────────────────────────────────────────┤
│              FastAPI 后端 (端口 8000)              │
│  ┌──────────┬───────────┬──────────┬──────────┐ │
│  │ Whisper  │ Translation│  TTS     │ Collectors│ │
│  │ 语音转写  │  翻译服务   │ 语音合成  │ 弹幕采集  │ │
│  └──────────┴───────────┴──────────┴──────────┘ │
│         CollectorManager (双平台调度)              │
│  ┌────────────────┬───────────────────────────┐ │
│  │  抖音采集器      │      TikTok 采集器         │ │
│  │  WebSocket+PB   │      TikTokLive v6        │ │
│  └────────────────┴───────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Python | ≥ 3.10 | 后端运行时 |
| Node.js | ≥ 18 | 前端构建 |
| Git | ≥ 2.30 | 版本控制 |

### 1️⃣ 克隆仓库

```bash
git clone https://github.com/Gary-96/leman-translate.git
cd leman-translate
```

### 2️⃣ 后端环境配置

```bash
cd backend

# 创建虚拟环境（推荐 Python 3.10）
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
copy .env.example .env   # Windows
cp .env.example .env     # macOS/Linux
# 编辑 .env 填入必要配置
```

### 3️⃣ 前端环境配置

```bash
cd ../frontend
npm install
```

### 4️⃣ 启动开发模式

**方式 A — 完整启动（后端 + 前端自动拉起）：**

```bash
cd frontend
npm run dev
```

> Electron 主进程会自动启动后端 Python 服务，健康检查通过后加载 UI。

**方式 B — 分别启动（调试用）：**

```bash
# 终端 1：启动后端
cd backend
python main_manager.py

# 终端 2：启动前端
cd frontend
npm run dev
```

### 5️⃣ 配置 API Key

启动后在 **设置面板** 中配置翻译服务商 API Key：

| 服务商 | 用途 | 获取地址 |
|--------|------|----------|
| Google Gemini | 翻译（推荐） | [Google AI Studio](https://aistudio.google.com/) |
| Groq | 翻译（低延迟） | [Groq Console](https://console.groq.com/) |
| DeepSeek | 翻译 | [DeepSeek Platform](https://platform.deepseek.com/) |
| OpenAI 兼容 | 翻译 | 支持自定义端点 |

---

## 📦 打包构建

### 一键打包

```bash
# 1. 打包后端引擎（PyInstaller）
build_backend.bat

# 2. 打包前端 + Electron 安装包
cd frontend
npx tsc --noEmit
npx vite build
npx electron-builder --win --x64
```

### 输出

```
output/
├── 乐曼同传小助手 Setup 0.1.1.exe    # NSIS 安装包（~349 MB）
├── 乐曼同传小助手 Setup 0.1.1.exe.blockmap
├── latest.yml                        # 自动更新元数据
└── backend_engine/
    └── backend_engine/               # PyInstaller 后端引擎
        ├── backend_engine.exe        # 后端可执行文件
        └── _internal/                # 依赖 + static 资源
```

> 安装包体积包含：Electron 运行时 + React UI + Python 后端引擎 + faster-whisper + torch CPU + 所有依赖。

---

## 📁 项目结构

```
leman-translate/
├── backend/                         # 🐍 FastAPI 后端
│   ├── main_manager.py              #    主入口（27 条路由 + WS 双通道）
│   ├── config_manager.py            #    配置持久化管理器（API Key / 设备 / 音色）
│   ├── audio_device_manager.py      #    声卡设备枚举与校验
│   ├── app/
│   │   ├── models/schemas.py        #    Pydantic 数据模型
│   │   └── services/
│   │       ├── whisper_service.py   #    faster-whisper 语音转写
│   │       ├── translation_service.py #  多服务商翻译（动态热切换）
│   │       ├── tts_service.py       #    Edge TTS 语音合成
│   │       └── language_manager.py  #    7 语言管理 + 翻译 Prompt 模板
│   ├── collectors/
│   │   ├── base.py                  #    采集器抽象基类
│   │   ├── manager.py               #    CollectorManager 双平台调度
│   │   ├── tiktok_collector.py      #    TikTok 弹幕（TikTokLive v6 + 10 事件）
│   │   └── douyin_collector.py      #    抖音弹幕（WebSocket + Protobuf）
│   ├── builder/                     #    抖音协议构建（auth/header/params/proto）
│   ├── dy_apis/douyin_api.py        #    抖音 API 封装
│   ├── utils/dy_util.py             #    签名/加密（sys._MEIPASS 兼容）
│   └── static/                      #    Protobuf 定义 + 签名 JS
│
├── frontend/                        # ⚛️ Electron + React 前端
│   ├── src/
│   │   ├── main/                    #    Electron 主进程
│   │   │   ├── index.ts             #    后端自启 + 健康检查 + IPC
│   │   │   ├── windowManager.ts     #    窗口管理（app.isPackaged 判断）
│   │   │   └── autoUpdater.ts       #    electron-updater 自动更新
│   │   ├── preload/index.ts         #    IPC 桥接（11 个通道）
│   │   └── renderer/                #    React UI
│   │       ├── components/
│   │       │   ├── Dashboard.tsx    #      主控台（极光风 + 后端状态 UI）
│   │       │   ├── DanmakuPanel.tsx #      弹幕面板（10 种消息类型）
│   │       │   ├── SettingsPanel.tsx#      设置面板（API Key / 设备 / 音色 / 语言）
│   │       │   └── AudioSpectrum.tsx#      FFT 频谱可视化
│   │       ├── hooks/
│   │       │   ├── useWebSocket.ts  #      双 WS 通信（弹幕 + 音频）
│   │       │   └── usePlatform.ts   #      REST API 封装
│   │       └── styles/global.css    #      深空电竞极光风 CSS 变量体系
│   ├── electron-builder.json        #    打包配置
│   └── vite.config.ts               #    Vite + electron 构建配置
│
├── build.bat                        # 一键打包脚本
├── build_backend.bat                # 后端 PyInstaller 打包脚本
├── .gitignore                       # 源代码与产物隔离
└── README.md
```

---

## 🎨 UI 设计

**深空电竞极光风** — 亚克力毛玻璃 + 霓虹渐变配色：

| 元素 | 配色 |
|------|------|
| 主背景 | 深空蓝黑 `#000814` |
| 翡翠绿 | `#10D9A3`（成功 / 在线） |
| 霓虹青 | `#00E5FF`（强调 / 链接） |
| 警示红 | `#EF4444`（错误 / 警告） |
| 金黄 | `#FFD700`（高频谱峰值） |

---

## 🔧 技术栈

### 前端
- **Electron 31** — 跨平台桌面框架
- **React 18** — UI 库
- **Vite 5** — 构建工具
- **TypeScript** — 类型安全
- **electron-updater** — 自动更新

### 后端
- **FastAPI** — 高性能异步 Web 框架
- **faster-whisper** — CTranslate2 加速的 Whisper 语音识别
- **google-generativeai** — Gemini API 翻译
- **TikTokLive v6** — TikTok 直播事件采集
- **sounddevice** — 音频设备管理
- **edge-tts** — TTS 语音合成
- **PyInstaller** — 后端引擎打包

### 通信
- **WebSocket 双通道** — `/ws/stream`（弹幕）+ `/ws/audio`（语音 + 频谱）
- **REST API** — 配置管理 / 平台切换 / 健康检查
- **IPC 桥接** — 11 个 Electron IPC 通道

---

## 🛠️ 扩展新平台

1. 继承 `BaseCollector` 抽象基类
2. 实现 `start()` 和 `stop()` 方法
3. 在 `CollectorManager` 中注册新平台

```python
from collectors.base import BaseCollector

class NewPlatformCollector(BaseCollector):
    async def start(self, room_id: str):
        # 实现连接逻辑
        ...

    async def stop(self):
        # 实现断开逻辑
        ...
```

---

## 📋 配置说明

### API Key 配置（应用内设置面板）

| 配置项 | 说明 |
|--------|------|
| 服务商选择 | Gemini / Groq / DeepSeek / OpenAI 兼容 |
| API Key | 密码式输入，支持显隐切换 |
| 自定义端点 | OpenAI 兼容接口可自定义 base_url |
| 模型名称 | 每个服务商可独立配置模型 |
| 连通性校验 | 保存时自动测试 API 可用性 |

### 音频配置

| 配置项 | 说明 |
|--------|------|
| 输入设备 | 自动枚举，支持专业设备识别（18 个关键词） |
| TTS 音色 | Edge TTS 预设 + 自定义音色 |
| 语言对 | 7 种语言互译，支持一键对调 |

---

## 📄 许可证

[MIT License](LICENSE)

---

<div align="center">

**乐曼同传小助手** — 让语言不再是交流的障碍

Made with ❤️ by [Gary-96](https://github.com/Gary-96)

</div>
