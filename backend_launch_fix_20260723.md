# 后端引擎启动失败修复

**日期**: 2026-07-23

## 问题
生产环境 `backend_engine.exe` 启动失败，无错误日志可排查。

## 修复内容

### 1. 残留进程清理 (`killStaleBackend`)
- `app.whenReady()` 时，生产环境先执行 `tasklist` 检测残留 `backend_engine.exe`
- 若存在则 `taskkill /F` 强制杀死，再启动新进程
- 避免端口 8000 被旧进程占用导致新进程启动失败

### 2. 路径适配 (`getBackendPaths`)
- 使用 `app.isPackaged` 替代 `NODE_ENV` 判断生产/开发环境（更可靠）
- 生产：`process.resourcesPath/backend_engine/backend_engine.exe`
- 开发：`__dirname/../../../backend/main_manager.py`
- 启动前 `existsSync` 检查，不存在时直接通知渲染进程

### 3. 错误日志捕获
- 新增 `writeLog()` 函数，日志写入 `app.getPath('userData')/logs/backend.log`
- 监听 `stdout`（INFO 级）、`stderr`（ERROR 级）、`spawn error` 事件
- 每条日志带 ISO 时间戳，同时输出到控制台和文件
- 新增 IPC 通道 `backend:open-log`，preload 暴露 `openBackendLog()` 方法
- Dashboard 失败界面显示错误信息 + "查看日志文件"按钮

### 4. 附带修复
- 重启后端时重置 `healthCheckRetryCount`（旧代码不重置导致重启后直接超时）
- 新增加载态 UI（`!backendReady && !backendFailed` 时显示"正在启动后端引擎..."）
- `backend:failed` / `backend:crashed` 事件携带错误详情和日志路径
- 新增 `backendProcess.on('error')` 捕获 spawn 级别错误（如文件不存在、权限不足）

## 修改文件
- `frontend/src/main/index.ts` — 完整重写后端启动逻辑
- `frontend/src/preload/index.ts` — 新增 `openBackendLog` IPC 方法
- `frontend/src/renderer/components/Dashboard.tsx` — 加载态 UI + 失败态错误展示和日志按钮

## 验证
- TypeScript 零错误
- Vite 构建：38 模块，204.36 KB JS
- electron-builder 打包：289.8 MB
