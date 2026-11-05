# 开发状态与历史记录

当前状态以最近日期的条目及 FEATURE-PARITY.md 为准。下方保留开发过程中逐阶段的历史结果，早期“未实现/仅内存”等状态不代表最新实现。日志、截图和真实测试媒体仅存在开发环境，公开仓库不包含这些文件。

更新：2026-10-29。完整重构尚未完成，最新范围见 FEATURE-PARITY.md（115 个原版注册命令作为历史审计；Agent/MCP 已移除、云盘暂缓）。

## 本轮实现

- 原版风格侧栏及右工作区、完整导航（含关系图谱）、折叠、深浅主题、缩放、Debug、导航右键独立开窗。视频课节表格、字幕预览、导出记录。未迁移功能明确标识。
- core/canvas.ts：真实 Canvas 课程和文件/作业/讨论/成员/成绩/教学大纲只读接口，分页、去重、不推进与跨域检测、字段过滤。大纲当前安全显示源文本。
- electron/canvas-session.ts：SJTU/JI 学校登录窗、用户身份验证、Cookie 会话与注销；远程窗无 preload/Node，启用隔离和 sandbox。登录成功才切换平台；后台 revision 和 UI 请求代次拒绝旧结果。仅401归为未登录，其余错误保留。
- 独立 userData：系统 appData 下 SJTU-Canvas-Rebuild-Electron-schema1；平台分区有 schema1 标识。没有读取或覆盖旧配置。真实登录代码已实现但未经本人学校账号验收，不能宣称学校全链路已打通。
- 保留录像手动 JWT 与演示模式，未实现录像 SSO/LTI、自定义 Canvas、多账号管理。

## 验证

两套 TypeScript 检查、10 项领域测试、Vite 构建通过。Canvas 测试是固定响应，不等于学校真实接口测试。

实际 Electron smoke 验证隔离 renderer、preload IPC、第二窗口、字幕原始/优化/空/403、UI 点击和主进程 SRT 写盘；保存对话框使用替身。smoke-result.json 记录结果。smoke-preview.png、smoke-reference.png、smoke-narrow.png 为真实窗口截图；2283×1165 与640×800检查无整页横向溢出，常规/窄窗已目视检查，尚非完整视觉验收。

未执行真实学校账号 E2E、学校提交/评分等写操作、原版测试、安装包或干净环境验收。

## 运行

搬迁后的 pnpm 11 自动依赖检查会尝试重装并因无 TTY 中止；现有依赖可用，本轮不重装、不改锁文件，使用：

```powershell
pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=false typecheck
pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=false test
pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=false build
.\node_modules\electron\dist\electron.exe tests/electron-smoke.cjs
.\node_modules\electron\dist\electron.exe .
```

## 剩余工作

真实账号登录与只读接口验收；录像登录/LTI、学期/多来源课程、视频播放/下载/直播/机位、PPT/OCR、文件夹/下载/同步/预览、作业详情/附件/提交、讨论详情、日程、成员导出、成绩统计与批改。统一后台任务、取消/重试/冲突、跨窗订阅未迁移；当前导出表仅本窗记录。二维码、年度总结、关系图谱、完整设置、账号迁移、打包与更新仍全部保留范围。

本轮最终 smoke 进程退出码为0，stdout明确报告通过（smoke-stdout.txt）。stderr 含 Chromium 缓存访问警告，以及测试预期的403/空字幕异常；设置页后台身份检查实际返回HTTP404，已显示为错误，不能视为真实登录通过。退出时还出现一次无效窗口IPC请求日志，后续应完善销毁期轮询清理；不影响本轮断言，但不可忽略为正式运行验收。

## 2026-10-29 EPIPE 弹窗修复

用户截图的异常来自此前直接启动烟测后父进程输出管道关闭：Electron 的 console.error 写入断管，触发未捕获 EPIPE；测试超时再次写日志，导致重复错误弹窗。此前将直接启动命令的即时返回码当作完成证据不可靠，今后使用等待式启动器。

新增 electron/stdio.cjs，只处理 stdout/stderr 的 EPIPE，其他错误仍抛出；主程序和烟测入口均安装。超时和失败分支用 finally 保证退出。新增 tests/run-electron-smoke.cjs，将输出直连文件、等待子进程退出、启动前删除过期结果；不再以异步 GUI 启动返回码代替测试完成。

验证：12 项测试通过（包含真实子进程输出管道关闭后连续日志的回归）、两套类型检查和构建通过。修复后 node tests/run-electron-smoke.cjs 实际退出码0，烟测日志与结果重新生成。检查时无残留 Electron 进程。运行烟测请使用 node tests/run-electron-smoke.cjs 或 test:electron 脚本，替代上文直接 electron 烟测命令。


## 2026-10-29 范围调整

按用户要求永久移除 Canvas Agent/MCP，已删除导航和开窗许可；原项目未迁移的相关服务与依赖不再引入。云盘暂不开发。AGENT.md 内容合并到 AGENTS.md 并删除重复文件，PROMPT 同步。最新范围优先于共享需求中的历史条款。运行与手工测试见 RUN-AND-TEST.md。

## 2026-10-29 凭据与启动修复

用户终端无全局pnpm，新增run.ps1 start/build/check/smoke，直接调用现有Node和项目依赖；start自动构建并重定向日志，不需要全局pnpm。运行指南已同步。

此前仅有录像JWT输入框，Canvas个人Token未接入，填入JWT框会触发录像10013；并非证明用户的Canvas Token无效。新增canvasConnectToken IPC及Canvas密码输入框，Bearer认证只发往所选Canvas站点API；验证身份后提交会话，失败保留原会话，秘密仅后台内存，输入提交清空。学校登录使用独立Cookie且不会继承Token。无Token且无本站Cookie时直接显示未登录，避免启动时无认证身份探测产生404；已有会话的404仍作为真实错误保留，不虚报成功。用户提供的401/404不足以证明原身份接口地址错误，接口仍与原版一致，真实有效Token尚待本人验收。

录像JWT格式提前校验；10013提示两种凭据不能混用。原版导航/品牌/折叠/Debug的MUI Rounded图标以同版SVG路径复用，无MUI运行依赖，附MIT许可并打包携带。

本轮两套类型检查、15项测试及生产构建通过；Electron smoke新增检查SVG导航与Token IPC非法输入拒绝并通过。未使用用户真实Token，也未读取旧配置。下一步由本人用Canvas Token验证真实数据。


## 2026-10-29 普通启动窗口修复及文档核对

用户反馈 run.ps1 start 构建后无窗口。发现 Start-Process 使用 WindowStyle Hidden，且本项目有5组残留实例及缓存访问警告；此前烟测单独显示窗口，不能代表普通启动。修正为 Normal；主进程显式持有窗口，ready-to-show show/focus；单实例锁与second-instance唤醒，避免重复后台实例。sessionData使用独立userData目录；烟测独立.smoke-profile，避免争用真实账号缓存。启动日志按时间分文件。

已清理仅本项目路径的旧隐藏实例。新增 tests/startup-smoke.ps1，实际从run.ps1 start启动，经Windows IsWindowVisible检查窗口可见、启动器未提前退出，正常关闭后退出码0。logs/startup-result.json记录普通启动结果；专用Electron烟测另行通过。调试中一次标题匹配错误已修正（HTML标题此前覆盖BrowserWindow标题），index.html同步为SJTU Canvas Helper。

AGENTS.md已核对并补充无pnpm启动、可见窗口、独立烟测、凭据分离、原版SVG及文档同步规则。PROMPT/README/RUN-AND-TEST/FEATURE-PARITY同步最新范围；AGENT.md已合并删除。共享docs保持只读，历史范围冲突以AGENTS最新说明为准。此前“启动脚本已验证”的表述仅覆盖build/check，普通入口未验收，现已补验。

## 2026-10-29 自主测试与反馈修复

最新结果以 TEST-REPORT.md 为准。用户确认登录/课程读取大致可用、多窗口正常；其余真实路径不能据此全部判定已验收。

已完成系统加密持久化Canvas Token/平台/有效Cookie（包含session Cookie快照恢复）、退出清除、失败认证保留原会话。录像JWT成功验证后亦加密保存，新增通过SJTU Canvas会话兑换录像按钮，JI Token禁止发往SJTU。旧版本内存Token需首次重新登录一次，不能从已退出进程找回。

课程新增当前学期优先与历史学期倒序、学期筛选；空白名称优先真实课程代码/原名，缺失与访问受限保留编号和原因。分页重复补充缺失字段。切学期/课程清空旧资料；模拟网络错误显示失败且不当作读取0条成功。

两套类型检查、27项测试、构建、Electron UI烟测、普通启动验证通过。五个独立Electron进程验证真实Windows safeStorage和Cookie重启恢复/注销通过，学校响应是fixture，不能冒充真实账号。真实录像测试已执行，初次在SSO连接阶段失败，尚未获取JWT，最终诊断记录见TEST-REPORT。

本目录已建立本地Git：开发期本地快照与实现提交；会话/日志/截图被忽略，不含真实凭据，不推送远程。AGENTS/PROMPT/README/RUN-AND-TEST同步新规则。


录像诊断最终更新：已用真实本机302服务确认Session.fetch手动重定向失败，改为net.request读取Location并保留Cookie；测试通过。修复about:blank iframe干扰。真实录像重试最终为“需要本人完成学校登录”，尚无JWT、未读取真实课节/字幕，不计通过。新增1项回归后共28项测试，详细见TEST-REPORT。


## 2026-10-30 性能与视频下载迁移

用户反馈页面切换卡顿：原CanvasWorkspace每次挂载重新请求全课程、资料无后台缓存。现主进程缓存Canvas/录像课程5分钟、Canvas资料/录像课节/字幕60秒；合并并发请求、失败不缓存、切账号清空并拒绝旧响应。切页读取缓存，点击刷新/读取数据主动更新。首次进入及缓存过期仍需要真实网络，尚未量化学校环境耗时。

新增录像空间独立视频机位下载：course_vod_urls_new按原版解析，URL只在后台，renderer仅机位编号/名称。保存目录选择、后台共享串行队列、任务进度广播、多窗口共享、活动任务去重、取消/重试、未知长度、200/完整206、断连/HTML/HLS错误、.part清理和原子不覆盖目标、退出取消并等待清理。重试重新解析地址；切账号后旧任务无法获取新账号源。当前仅直链视频，HLS分段/合并、旧录像/Canvas不同来源、进程重启恢复任务、视频播放器尚未迁移。

验证：两套tsc、41项领域测试、生产构建通过。真实本机HTTP流测试未知长度/206/断连/shutdown通过。Electron烟测使用固定机位响应和媒体协议替身，验证机位URL不回renderer、原生目录对话框替身、下载IPC、实际后台写文件以及第二窗口查询同任务；非学校真实下载验收。学校端尚待本人已登录状态验收，不宣称完成。


## 2026-10-30 真实下载故障修复与验收

用户反馈无法下载后，使用本重构已保存的录像凭据（不读原版）复现：4门课程和2机位接口成功，Chromium net.fetch/net.request访问live.sjtu.edu.cn媒体返回ERR_BLOCKED_BY_CLIENT；同一签名地址使用Node fetch返回206 video/mp4。下载媒体层切换Node fetch，业务API保持原认证，严格学校HTTPS地址和不跟随未知重定向策略不变，媒体请求不带API JWT。

真实下载完整通过：tests/download-live.cjs执行课程→课节→机位→媒体探测→DownloadManager完整写盘，832805903字节（约794MiB）；长度校验通过，MP4顶层ftyp/free/mdat/moov完整且无残留part。证据logs/download-live-result.json，测试文件保存在该报告filePath（项目logs目录），未提交Git。此证据仅覆盖一个真实机位，不外推HLS、多来源、所有课程。

Windows默认保存目录改为app.getPath("videos")下SJTU Canvas Helper，自动创建，不再每次弹目录选择。用户重定向系统视频目录也适用。测试使用logs目录替身，原文件冲突仍拒绝覆盖。41测试、类型检查、构建、Electron集成烟测通过。入口仍run.ps1 start，须关闭旧窗口重启加载新后台。


## 2026-10-30 路径确认、批量选择与全部机位修正

用户澄清“默认目录”指路径选择器初始位置，之前直接保存的实现理解有误。现恢复每批一次目录选择器，初始定位系统视频/SJTU_Canvas_Helper-electron，可更改，必须确认后才解析机位并入队；取消零任务。单行/多选默认下载全部机位，移除逐机位点击卡片。

参照原版video.tsx表格选择，新增课节复选、多选、表头全选/半选、已选数量、清空、切课程/刷新清空；整批去重课节，部分失败不会丢弃成功项，报告失败课节。现有后台串行/共享/取消重试/冲突保护不变，仍限直接视频。

45项测试、两套类型检查、生产构建通过。4项批量测试覆盖一次目录确认/全部机位/重复选择去重/取消零任务/部分失败/账号变化；Electron烟测验证路径默认名称、取消零任务、一个课节两个机位均实际写盘（固定媒体替身）及全选/半选/清空。原生目录选择器的人工交互未自动操作，未为此次UI修改重复下载真实794MB文件，媒体下载沿用已验证传输。


2026-10-30下载目录分层更新：参照原版enqueueVideoExports的“课程→课堂范围”组织，不再平铺。现为“所选目录 / 课程名_课程ID / 课节时间标题_录像ID / 机位N.mp4”。选择器仍每批一次、用户确认后开始，默认全部机位；非法字符清理、目录名长度限制、Windows保留名处理，ID区分同名课程/课节。目录在下载写盘时按需创建，已有文件仍不覆盖。本轮46测试、两套类型检查、生产构建及Electron烟测通过（固定媒体两机位在子目录实际写盘）。本轮未重复下载真实大视频。


## 2026-10-30 源码与便携版打包

生成Windows x64 portable单文件，产品名SJTU_Canvas_Helper-electron，版本0.1.0；使用现有Electron45.1.0本地运行时打包，免安装Node/pnpm。46项测试、类型检查、生产构建通过。electron-builder便携版构建成功；win-unpacked和最终portable exe均经tests/distribution-smoke.ps1使用隔离配置实际启动，Windows窗口可见、关闭退出码0。logs/distribution-result.json记录最终portable结果。包内asar共119项，主入口/preload/stdio/图标许可存在，未发现会话文件、logs、测试或本机下载视频。未配置签名/自动更新，未在另一台干净机器验收。

DISTRIBUTION.md提供异机使用及源码构建说明。发布源码使用git归档白名单并附Git bundle，排除node_modules、构建缓存、日志、会话、凭据和下载文件；生成SHA256核对。便携版仍使用当前Windows用户appData加密账号，换机器重新登录，不将本机密文迁移。


## 2026-11-05 按开课日期归组

只读检查用户指定的既有下载目录，看到课程下按YYYY-MM-DD分组，同一天多个开课时间视频同放一个日期文件夹。现调整新下载路径为“所选目录/课程名_课程ID/YYYY-MM-DD/HH_mm_ss_录像ID_机位N.mp4”，取消每课节独立子目录；时间与录像ID避免同日/同刻课节互相覆盖。日期由结构化startTime读取，带时区时间统一为Asia/Shanghai；无有效日期放“日期未知”并保留标题/ID，不猜测日期。现有文件未移动、未修改。

48项测试、两套类型检查、Vite构建和Electron烟测通过；新增同日共享目录、跨日分离、同刻不同ID不碰撞、上海跨日/时区、非法与未知日期保护。本轮更新源码及dist，之前release内已交付的0.1.0便携包和源码zip未重新生成，不包含本次修改。
