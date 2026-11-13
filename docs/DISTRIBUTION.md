# 其他机器运行说明

## Windows 便携版

适用于 Windows x64。双击 `SJTU_Canvas_Helper-electron-0.1.0-win-x64-portable.exe`，无需安装 Node、pnpm 或 Electron。首次启动会解压内置程序，请稍等。

便携版指无需安装；账号数据仍保存在当前用户的 `%APPDATA%/SJTU-Canvas-Rebuild-Electron-schema1`，不是保存在 exe 旁边。Token/Cookie 使用本机系统加密，换机器需要重新登录，不能复制密文当作账号迁移。程序包不包含开发机器的账号、下载视频或日志。

视频下载每批先确认目录，选择器初始为系统“视频/SJTU_Canvas_Helper-electron”，按课程/课节/机位分层保存。需要可访问学校网站的网络。当前仍是迁移中的版本，HLS合并、云盘等范围见 FEATURE-PARITY.md，Agent/MCP已移除。

当前未配置发行签名和自动更新。系统如显示未知发布者，应先核对随包 SHA256。本机打包启动检查不能代替另一台干净机器的实际测试。

## 源码包

源码包不包含 node_modules、构建产物、用户凭据、运行日志及下载文件。开发运行需 Node.js 22.12+，安装 pnpm 后，在源码根目录执行：

```powershell
pnpm install --frozen-lockfile
.\run.ps1 check
.\run.ps1 start
```

依赖安装需联网，Electron安装脚本会下载二进制；保持现有 pnpm-lock.yaml。打包使用：

```powershell
.\run.ps1 build
node node_modules/electron-builder/cli.js --win portable --x64
```

`release/` 为输出目录。公开源码可直接克隆本仓库。开发机器保留的历史 bundle 仅用于本地备份，不作为公开分发内容。
