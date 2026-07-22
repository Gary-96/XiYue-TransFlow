# 乐曼同传 - Leman Translate

中越直播实时翻译助手，支持抖音和 TikTok 双平台弹幕采集与中越互译。

## ✨ 功能特性

- **双平台支持**: 抖音 + TikTok 直播间弹幕实时采集
- **语音翻译**: 主播语音实时转录为中越互译
- **弹幕翻译**: 粉丝评论自动翻译并显示
- **语言检测**: 自动识别中文/越南语/英语
- **实时通信**: WebSocket 双向低延迟传输
- **跨平台**: Windows/macOS/Linux 桌面应用

## 🎨 UI 模式

| 模式 | 说明 |
|------|------|
| 🖥️ 标准窗口 | 完整毛玻璃窗口，显示所有功能 |
| 🏝️ 灵动岛 | 顶部悬浮胶囊，只显示当前翻译 |
| 🎬 OBS 绿幕 | 纯绿背景，适合 OBS 色度键控抠图 |
| 📜 双语历史 | 侧滑面板，显示所有翻译记录 |

## 📦 打包成 exe 安装包

### 方式一：一键脚本（推荐）
双击运行项目根目录的 `build.bat`，自动完成所有步骤。

### 方式二：手动打包

```bash
cd frontend
npm install
npx tsc --noEmit
npx vite build
npx electron-builder --win --x64
```

### 输出文件

打包完成后，安装包位于 `frontend/release/`：

| 文件 | 说明 |
|------|------|
| `乐曼同传 Setup 3.0.0.exe` | NSIS 安装程序（带卸载） |
| `乐曼同传 3.0.0.exe` | 免安装包（解压即用） |

### 注意事项

- 首次打包需要下载 Electron 二进制文件（约 100MB），后续打包会缓存
- 打包过程约需 2-5 分钟
- 生成的安装包约 80-120MB（包含 Python 运行时 + 所有依赖）

## 🚀 快速开始

### 环境要求
- Python 3.9+
- Node.js 18+
- Git

### 1. 安装后端依赖
```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env，填入 Gemini API Key
```

### 3. 启动后端
```bash
python main_manager.py
# 或
uvicorn main_manager:app --host 0.0.0.0 --port 8000 --reload
```

### 4. 安装前端依赖
```bash
cd ../frontend
npm install
```

### 5. 启动应用
```bash
npm run dev
```

## 📁 项目结构

```
中越直播小助手/
├── backend/                    # FastAPI 后端
│   ├── main_manager.py         # 主入口（端口 8000）
│   ├── app/
│   │   ├── models/schemas.py   # 统一数据模型
│   │   └── services/
│   │       ├── whisper_service.py     # 语音识别 (faster-whisper)
│   │       └── translation_service.py # 翻译服务 (Gemini API)
│   ├── collectors/
│   │   ├── base.py             # 采集器基类
│   │   ├── manager.py          # 采集器管理器
│   │   ├── tiktok_collector.py # TikTok 弹幕采集
│   │   └── douyin_collector.py # 抖音弹幕采集
│   ├── builder/                # 抖音协议构建器
│   │   ├── auth.py             # 认证
│   │   ├── header.py           # 请求头
│   │   ├── params.py           # 参数签名
│   │   └── proto.py            # Protobuf
│   ├── dy_apis/                # 抖音 API 封装
│   │   └── douyin_api.py
│   ├── utils/                  # 工具函数
│   │   ├── dy_util.py          # 签名/加密
│   │   └── common_util.py      # 通用工具
│   └── static/                 # Protobuf 定义和签名 JS
├── frontend/                   # Electron + React 前端
│   ├── src/
│   │   ├── main/               # Electron 主进程
│   │   │   ├── index.ts        # 后端自启 + IPC
│   │   │   └── windowManager.ts # 多窗口管理
│   │   ├── preload/            # IPC 桥接
│   │   │   └── index.ts
│   │   └── renderer/           # React 渲染层
│   │       ├── App.tsx         # 路由入口
│   │       ├── components/
│   │       │   ├── Dashboard.tsx      # 主控制台
│   │       │   ├── DanmakuPanel.tsx   # 弹幕面板
│   │       │   ├── SubtitleOverlay.tsx # 灵动岛字幕
│   │       │   └── OBSWindow.tsx      # OBS 绿幕
│   │       ├── hooks/
│   │       │   ├── useWebSocket.ts    # 双 WS 通信
│   │       │   ├── usePlatform.ts     # REST API
│   │       │   └── useHashRoute.ts    # Hash 路由
│   │       └── styles/global.css      # 极光风格
│   ├── package.json
│   └── vite.config.ts
├── build.bat                   # 一键打包脚本
└── README.md
```

## 🛠️ 添加新平台

1. 继承 `BaseCollector` 类
2. 实现 `start()` 和 `stop()` 方法
3. 在 `CollectorManager` 中注册新平台

## 📄 许可证

MIT License

---

**乐曼同传 Leman Translate** - 让语言不再是交流的障碍
