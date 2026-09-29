@echo off
chcp 65001 >nul
echo ========================================
echo   TransFlow - Backend Build
echo   Output: output\backend_engine
echo   注意: server/ 云端授权服务已排除在打包之外
echo ========================================
echo.

cd /d "%~dp0"

set PY=C:\Users\k9831\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe
set PROJ_DIR=D:\001源代码\中越直播小助手
set BACKEND_DIR=%PROJ_DIR%\backend
set STATIC_DIR=%BACKEND_DIR%\static
set PROMPTS_DIR=%BACKEND_DIR%\prompts
set SERVER_DIR=%PROJ_DIR%\server

echo [1/4] Creating output directories...
if not exist "output\backend_engine" mkdir "output\backend_engine"
if not exist "output\build_backend" mkdir "output\build_backend"
echo [OK] output\ ready
echo.

echo [2/4] Cleaning old backend artifacts...
if exist "output\backend_engine\backend_engine.exe" del /q "output\backend_engine\backend_engine.exe"
if exist "output\build_backend\backend_engine" rmdir /s /q "output\build_backend\backend_engine"
if exist "output\build_backend\backend_engine.spec" del /q "output\build_backend\backend_engine.spec"
echo [OK] Cleaned
echo.

echo [3/4] PyInstaller packaging (5-10 minutes)...
echo    正在排除 server/ 目录（云端授权服务）...
"%PY%" -m PyInstaller ^
    --noconfirm ^
    --clean ^
    --name backend_engine ^
    --onefile ^
    --console ^
    --distpath "output\backend_engine" ^
    --workpath "output\build_backend\backend_engine" ^
    --add-data "%STATIC_DIR%;static" ^
    --add-data "%PROMPTS_DIR%;prompts" ^
    --exclude-module server ^
    --exclude-module cloud_auth ^
    --hidden-import numpy ^
    --hidden-import numpy.core ^
    --hidden-import torch ^
    --hidden-import torchaudio ^
    --hidden-import torch.nn ^
    --hidden-import torch.nn.functional ^
    --hidden-import torch.optim ^
    --hidden-import torch.utils.data ^
    --hidden-import faster_whisper ^
    --hidden-import ctranslate2 ^
    --hidden-import onnxruntime ^
    --hidden-import tokenizers ^
    --hidden-import huggingface_hub ^
    --hidden-import av ^
    --hidden-import google.generativeai ^
    --hidden-import TikTokLive ^
    --hidden-import aiohttp ^
    --hidden-import websockets ^
    --hidden-import pydantic ^
    --hidden-import fastapi ^
    --hidden-import uvicorn ^
    --hidden-import bs4 ^
    --hidden-import lxml ^
    --hidden-import PyExecJS ^
    --hidden-import blackboxprotobuf ^
    --hidden-import google.protobuf ^
    --hidden-import app.services.whisper_service ^
    --hidden-import static.Response_pb2 ^
    --hidden-import static.Request_pb2 ^
    --hidden-import app.services.llm_service ^
    --hidden-import collectors.tiktok_collector ^
    --hidden-import collectors.douyin_collector ^
    --hidden-import dy_apis.douyin_api ^
    --hidden-import builder.auth ^
    --hidden-import bs4 ^
    --hidden-import lxml ^
    --collect-all faster_whisper ^
    --collect-all ctranslate2 ^
    --collect-all onnxruntime ^
    --collect-all tokenizers ^
    --collect-all huggingface_hub ^
    --collect-all av ^
    --collect-all google ^
    --collect-all google.generativeai ^
    --collect-all TikTokLive ^
    --collect-all bs4 ^
    --collect-all lxml ^
    --collect-all blackboxprotobuf ^
    "%BACKEND_DIR%\\main.py"

if errorlevel 1 (
    echo [X] PyInstaller failed
    pause
    exit /b 1
)
echo [OK] Backend packaged
echo.

echo [4/4] Verifying...
if exist "output\backend_engine\backend_engine.exe" (
    echo [OK] output\backend_engine\backend_engine.exe generated
    for %%A in ("output\backend_engine\backend_engine.exe") do echo     Size: %%~zA bytes
) else (
    echo [X] backend_engine.exe not found
    pause
    exit /b 1
)
echo.

echo ========================================
echo   [OK] Backend build complete!
echo   Location: output\backend_engine\
echo   Note: server/ (cloud auth) is NOT included
echo ========================================
pause

