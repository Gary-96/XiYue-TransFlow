@echo off
chcp 65001 >nul
echo ========================================
echo   乐曼同传 Leman Translate - 打包脚本
echo ========================================
echo.

cd frontend

echo [1/4] 安装前端依赖...
call npm install
if errorlevel 1 (
    echo [X] npm install 失败
    pause
    exit /b 1
)
echo [OK] 依赖安装完成
echo.

echo [2/4] TypeScript 类型检查...
call npx tsc --noEmit
if errorlevel 1 (
    echo [X] TypeScript 类型检查失败
    pause
    exit /b 1
)
echo [OK] 类型检查通过
echo.

echo [3/4] 构建前端 (React + Electron)...
call npx vite build
if errorlevel 1 (
    echo [X] Vite 构建失败
    pause
    exit /b 1
)
echo [OK] 前端构建完成
echo.

echo [4/4] 打包 Electron 应用...
call npx electron-builder --win --x64
if errorlevel 1 (
    echo [X] Electron 打包失败
    pause
    exit /b 1
)
echo.
echo ========================================
echo   [OK] 打包完成！
echo   安装包位于: frontend/release/
echo ========================================
echo.
pause
