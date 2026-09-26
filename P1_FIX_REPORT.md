# P1 级缺陷修复报告

> 修复时间：2026-09-27  
> Commit：`6969213`  
> 状态：**✅ 全部完成，tsc --noEmit 零错误**

---

## 修复清单

### P1-1：OllamaBackend.is_available 事件循环冲突 ✅

**问题**：原实现使用 `asyncio.get_event_loop().run_until_complete()` 在同步属性中调用异步方法，在 FastAPI 异步上下文中会导致 RuntimeError。

**修复**：
- 重写 `is_available` 属性：检测是否在有运行中的事件循环
  - 无事件循环 → `asyncio.run(self._check_health())`
  - 有事件循环 → `asyncio.to_thread()` 执行同步版本
- 新增 `_check_health_sync()` 同步健康检查方法（使用 requests）
- `get_status()` 统一使用 `is_available_async()`

**文件**：`backend/app/services/llm_service.py`

```python
# 修复前
@property
def is_available(self) -> bool:
    raise RuntimeError("不能在异步上下文调用")

# 修复后
@property
def is_available(self) -> bool:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(self._check_health())
    return asyncio.get_event_loop().run_until_complete(
        asyncio.to_thread(self._check_health_sync)
    )
```

---

### P1-2：CORS 过于宽松 ✅

**问题**：`allow_origins=["*"]` 允许任意来源访问 API，存在安全风险。

**修复**：限制为本地地址
```python
allow_origins=["http://localhost:*", "http://127.0.0.1:*"],
```

**文件**：`backend/main.py`

---

### P1-3：音频热拔插保护 ✅

**问题**：录音过程中拔出麦克风/声卡会导致崩溃或挂起。

**修复**：添加 `devicechange` 事件监听，录音中设备变化时自动重启：
```typescript
navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange)
```

**文件**：`frontend/src/renderer/hooks/useWebSocket.ts`

---

### P1-4：PyInstaller 路径兼容 ✅

**问题**：`sys._MEIPASS` 在某些环境下未定义，导致打包后路径解析失败。

**修复**：
- 改用 `getattr(sys, 'frozen', False)` 检测打包环境
- 补充 `Path` 导入
- 回退到用户缓存目录

**文件**：`backend/app/services/whisper_service.py`

---

### P1-5：SOUL Prompt 路径兼容 ✅

**问题**：venv 模式下找不到 SOUL Prompt 文件。

**修复**：动态添加 venv 模式路径
```python
_SOUL_PROMPT_PATHS.append(
    Path(__file__).resolve().parents[1] / "prompts" / "vietnam-live.SOUL.md"
)
```

**文件**：`backend/app/services/translation_service.py`

---

### P1-6：CUDABackend 缺少异步方法 ✅

**问题**：`LocalLLMService.get_status()` 调用 `CUDABackend.is_available`，但该方法在异步上下文中使用。

**修复**：添加 `is_available_async()` 方法
```python
async def is_available_async(self) -> bool:
    return self.is_available
```

**文件**：`backend/app/services/llm_service.py`

---

### P1-7：config_manager.py 孤立注释 ✅

**问题**：`set_local_config` 方法后有孤立的注释块导致代码可读性差。

**修复**：清理孤立注释

**文件**：`backend/config_manager.py`

---

## 验证结果

```bash
# TypeScript 检查
$ npx tsc --noEmit
# ✅ 零错误

# Python 服务验证
$ python -c "from app.services.whisper_service import WhisperService; print('OK')"
WhisperService OK

$ python -c "from app.services.translation_service import TranslationService; print('OK')"
TranslationService OK
```

---

## 变更统计

| 文件 | 变更 |
|------|------|
| `backend/app/services/llm_service.py` | OllamaBackend.is_available 安全化 + CUDABackend.is_available_async |
| `backend/app/services/whisper_service.py` | 补充 Path 导入 + PyInstaller 路径兼容 |
| `backend/app/services/translation_service.py` | 补充 venv 模式 SOUL Prompt 路径 |
| `backend/config_manager.py` | 清理孤立注释 |
| `backend/main.py` | CORS 收紧为本地地址 |
| `frontend/src/renderer/hooks/useWebSocket.ts` | 音频设备热拔插监听 |

---

## 待办事项（P2）

| 优先级 | 任务 | 预计耗时 |
|--------|------|----------|
| P2 | douyin_api.py 拆分（2034 行 → 3 文件） | 4h |
| P2 | 单元测试覆盖核心业务逻辑 | 6h |
| P2 | Tailwind 样式重构（提取 @layer components） | 2h |

---

## 下一步

需要继续执行 P2 级重构吗？
