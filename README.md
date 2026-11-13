# SJTU Canvas Helper Electron

[![Windows build](https://github.com/0kitasan/SJTU-Canvas-Helper-Electron/actions/workflows/windows-build.yml/badge.svg)](https://github.com/0kitasan/SJTU-Canvas-Helper-Electron/actions/workflows/windows-build.yml)

基于 Electron、TypeScript、React 的独立重构，参考并改编自 [SJTU Canvas Helper](https://github.com/Okabe-Rintarou-0/SJTU-Canvas-Helper)（Zihong Lin 及贡献者）。

## 当前能力

- SJTU/JI Canvas 登录、个人访问 Token、系统加密会话恢复及六类只读资料列表。
- 录像空间登录适配、课程/课节、原始/优化字幕预览与带版本 SRT。
- 视频多选/全选、整批一次目录确认、默认全部机位、共享后台队列、取消/重试；按课程和上海日期分目录。
- 深浅主题、折叠导航、缩放、多窗口、短TTL缓存及并发请求合并。

这是持续迁移中的项目，不是全部功能完成版。HLS分段合并及部分原版业务尚未迁移；Agent/MCP已移除，云盘暂缓。详细范围见 [docs/FEATURE-PARITY.md](docs/FEATURE-PARITY.md)，验证证据与边界见 [docs/TEST-REPORT.md](docs/TEST-REPORT.md)。

## 开发运行

需要 Node.js 22.12+ 和 pnpm。使用保留的锁文件安装：

```powershell
git clone git@github.com:0kitasan/SJTU-Canvas-Helper-Electron.git
cd SJTU-Canvas-Helper-Electron
pnpm install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
.\run.ps1 check
.\run.ps1 start
```

`run.ps1` 使用已安装的项目依赖；`start` 自动构建再启动。执行策略阻止时可使用 `powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1 start`。网页 `dev` 只供界面调试，没有 Electron 桥接。完整步骤见 [docs/RUN-AND-TEST.md](docs/RUN-AND-TEST.md)。学校媒体连接可用 `.\run.ps1 stability` 独立诊断（需已有录像登录）。

## Actions 构建

[Windows build](https://github.com/0kitasan/SJTU-Canvas-Helper-Electron/actions/workflows/windows-build.yml) 在推送、PR或手动触发后执行检查、测试和 Windows x64 便携版构建。成功后从该次运行的 Artifacts 下载程序，保留90天。当前不配置 Release、自动更新或签名。GitHub首次构建结果以 Actions 页面为准。

## 账号和数据

仓库不包含用户账号、Token、Cookie、日志或下载媒体。登录信息由系统加密保存在本机用户配置目录，跨机器需重新登录。Canvas Token 与录像JWT不同，不要混用，也不要在Issues中提交凭据或含敏感参数的URL。

## 许可证与署名

[MIT License](LICENSE)，保留上游 `Copyright (c) 2025 Zihong Lin`。本重构的适配修改沿用MIT。Material UI Rounded图标保留在 [图标许可](src/icons-LICENSE.txt)；更多说明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

发布边界、历史清理与CI说明见 [docs/PUBLICATION.md](docs/PUBLICATION.md)。项目交接入口是 [AGENTS.md](AGENTS.md)、[STATUS.md](STATUS.md) 和 [PROMPT.md](PROMPT.md)。
