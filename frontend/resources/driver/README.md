# 虚拟音频驱动安装包

将虚拟音频驱动的安装程序放置在此目录，NSIS 安装脚本会在用户安装软件时自动检测并静默安装。

## 支持的驱动

### 1. VB-Cable (推荐)
- 文件名: `vb-cable_setup.exe`
- 下载: https://vb-audio.com/Cable/
- 轻量级，仅创建虚拟音频线路

### 2. VoiceMeeter
- 文件名: `voicemeeter_setup.exe`  
- 下载: https://vb-audio.com/Voicemeeter/
- 功能更强大，支持混音

## 自动安装行为

安装时会按以下顺序检查：
1. 检查注册表中是否已有 VB-Cable 驱动
2. 检查注册表中是否已有 VoiceMeeter 驱动
3. 如果都没有检测到，尝试静默运行本目录下的安装程序
4. 如果安装程序不存在，提示用户手动下载安装

## 静默安装参数

- VB-Cable: `/S /SILENT`
- VoiceMeeter: `/S`
