!macro customInstall
  ; ============================================
  ; 检测是否安装了虚拟声卡 (VB-Cable)
  ; 如未安装则提示用户手动下载，不自动安装
  ; ============================================

  DetailPrint "正在检测虚拟声卡..."

  ; 检查 VB-Cable 驱动是否已安装 (64位注册表)
  SetRegView 64
  ReadRegStr $0 HKLM "SOFTWARE\VB-Audio\Cable" "DeviceName"
  StrCmp $0 "" check32bit driver_installed

check32bit:
  ; 检查 32 位注册表
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\VB-Audio\Cable" "DeviceName"
  StrCmp $0 "" driver_not_installed driver_installed

driver_installed:
  DetailPrint "虚拟声卡已安装: $0"
  Goto done

driver_not_installed:
  DetailPrint "未检测到虚拟声卡"
  MessageBox MB_OK "未检测到 VB-Cable 虚拟声卡。$\n$\n如需使用虚拟声卡功能，请手动下载安装：$\nhttps://vb-audio.com/Cable/$\n$\n安装完成后重启电脑即可生效。" /SD IDOK

done:
  DetailPrint "虚拟声卡检测完成"

!macroend
