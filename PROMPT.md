# 新对话接续提示词

继续维护本仓库 SJTU Canvas Helper Electron（Electron + TypeScript + React），不要从头重做。

仓库：https://github.com/0kitasan/SJTU-Canvas-Helper-Electron
当前公开分支：main。先运行 git status，确认并保留未提交改动，再阅读 AGENTS.md、STATUS.md、TEST-REPORT.md、FEATURE-PARITY.md、RUN-AND-TEST.md、PUBLICATION.md 和最近 Git 提交。

## 当前交接重点

刚完成下载断点恢复修复，用户已允许提交和推送，先核对本次提交及对应 Windows Actions 的状态。下载器在 core/downloads.ts。

- 《汽车数字化制造》最近4课节8机位曾实测：部分机位很快完成，部分连接停顿30秒后超时；不应据短时测速断言学校固定限速。
- 现最多2个机位任务并发；网络中断最多自动重连3次、1/2/4秒退避，每次重新解析媒体地址。
- 仅在ETag/Last-Modified和总长度可校验时使用Range/If-Range续传；200忽略Range、资源变化、无校验信息时安全重下，不盲拼；严格拒绝错误Range。
- 重试耗尽保留可信片段，可手动重试或清除。取消/退出清理片段。只支持当前进程内恢复，不支持跨重启恢复任务。
- 速率独立每秒更新，静默时降0，UI显示MiB/s和Mbps、重连阶段、保留片段。
- 59项测试、两套类型检查、构建、隔离Electron烟测通过。真实课节218411在8MiB人为断流后，成功从8388608续传；边界64KiB与服务器独立Range逐字节相符。不是四课节全量自然断流回归通过。
- 本机详细证据在被Git忽略的logs目录；换机器可能不存在，不可捏造本地证据。

## 不能丢失的产品要求

保留原版侧栏/布局及MUI Rounded SVG图标；Agent/MCP永久移除，云盘暂不开发。课程按学期排序并缓存。Canvas Token和录像JWT分离，系统加密持久化，不读取原版密钥。

视频多选/全选、默认所选课节全部机位。每批一次目录选择器，初始系统“视频/SJTU_Canvas_Helper-electron”，确认后才下载。路径：所选目录/课程名_课程ID/YYYY-MM-DD/HH_mm_ss_录像ID_机位N.mp4；上海日期，同日课节合并，既有文件不覆盖。下载媒体用Node fetch（Chromium曾被学校媒体域拦截）。

## 工作方式

- 正常运行 ./run.ps1 start；检查 ./run.ps1 check；构建 ./run.ps1 build；烟测 ./run.ps1 smoke。未安装依赖时按README用锁文件安装并显式安装Electron运行时。
- 新源码不会热更新旧进程；不得中断用户活动下载。真实测试仅在授权范围只读执行，学校提交/评分/截止日期等写操作禁止擅自测试。
- 真实学校测试、固定数据/本机HTTP测试、安装包验收分别记录。旧portable包不是最新源码。
- 保留MIT上游版权和链接，敏感信息检查后只推main；本地master是未公开旧历史，禁止push --all、mirror或公开旧bundle。禁止提交凭据、个人路径、日志、下载视频和会话。
- Actions只构建并上传Artifacts，保留90天，不创建Release、自动更新或签名。
- 持续同步状态和功能清单。普通实现/修复/构建自主完成，用户明确说“只测试不提交”时遵守；本次断点修复已解除该限制。

如果没有其他新需求，先确认本次Actions构建结果；之后优先验证自然断流下续传的长期稳定性，完整记录未完成项，不重复下载已经完成的大文件，也不要擅自扩展未确认的功能。
