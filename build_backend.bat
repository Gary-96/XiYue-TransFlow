@echo off
chcp 65001 >nul
echo ========================================
echo   Leman Translate - Backend Build
echo   Output: output\backend_engine
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Creating output directories...
if not exist "output\backend_engine" mkdir "output\backend_engine"
if not exist "output\build_backend" mkdir "output\build_backend"
echo [OK] output\ ready
echo.

echo [2/4] Cleaning old backend artifacts...
if exist "output\backend_engine\backend_engine.exe" del /q "output\backend_engine\backend_engine.exe"
if exist "output\build_backend\backend_engine" rmdir /s /q "output\build_backend\backend_engine"
if exist "backend\main_manager.spec" del /q "backend\main_manager.spec"
echo [OK] Cleaned
echo.

echo [3/4] PyInstaller packaging (5-10 minutes)...
set PY=C:\Users\k9831\AppData\Local\Programs\Python\Python310\python.exe
"%PY%" -m PyInstaller ^
    --noconfirm ^
    --clean ^
    --name backend_engine ^
    --onefile ^
    --console ^
    --distpath "output\backend_engine" ^
    --workpath "output\build_backend\backend_engine" ^
    --specpath "output\build_backend" ^
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
    --hidden-import numpy ^
    --hidden-import numpy.core ^
    --hidden-import torch ^
    --hidden-import torchaudio ^
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
    --hidden-import execjs ^
    --hidden-import blackboxprotobuf ^
    --hidden-import google.protobuf ^
    --hidden-import static.Response_pb2 ^
    --hidden-import static.Request_pb2 ^
    backend\main_manager.py

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
echo ========================================
pause
