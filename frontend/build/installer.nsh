!macro customInstall
  ; ============================================
  ; 检测是否安装了虚拟声卡 (VB-Cable)
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
  StrCmp $0 "" install_driver driver_installed

driver_installed:
  DetailPrint "虚拟声卡已安装: $0"
  Goto done

install_driver:
  DetailPrint "未检测到虚拟声卡，准备安装..."

  ; 检查是否存在驱动安装包
  IfFileExists "$INSTDIR\resources\driver\VBCABLE_Setup_x64.exe" 0 missing_driver

  ; 静默安装 VB-Cable 驱动
  DetailPrint "正在安装 VB-Cable 驱动..."
  ExecWait '"$INSTDIR\resources\driver\VBCABLE_Setup_x64.exe" /i /s' $1

  IntCmp $1 0 install_success install_failed

install_success:
  DetailPrint "VB-Cable 驱动安装成功"
  Goto done

install_failed:
  DetailPrint "VB-Cable 驱动安装失败 (错误码: $1)"
  MessageBox MB_OK "虚拟声卡驱动安装失败，请手动安装。$\n下载地址: https://vb-audio.com/Cable/" /SD IDOK
  Goto done

missing_driver:
  DetailPrint "未找到驱动安装包"
  MessageBox MB_OK "未找到虚拟声卡驱动安装包，请手动下载安装。$\n下载地址: https://vb-audio.com/Cable/" /SD IDOK

done:
  DetailPrint "虚拟声卡检测完成"

!macroend
