# 功能迁移与验收对照

审查日期：2026-10-29。原版 [SJTU-Canvas-Helper](https://github.com/Okabe-Rintarou-0/SJTU-Canvas-Helper) 为只读参考；本仓库 AGENTS.md 与本清单为验收依据。本清单按最新用户范围维护：Agent/MCP 永久移除，云盘暂缓；其余保留最终范围，导航入口与占位说明不代表业务完成。

状态：**未迁移** = 尚无可用实现；**演示** = 仅合成数据；**真实实现未验收** = 有真实接口或平台代码，但尚未完成对应真实场景验收；**已验收** = 仅限列明证据覆盖的行为，不能外推为整项产品验收。

## 功能逐项对照

| 功能 | 原版依据 | Electron 实现/当前状态 | 验证与剩余条件 |
|---|---|---|---|
| 完整左侧导航、右工作区、折叠、中文、深浅主题、缩放、窄窗 | `src/components/layout.tsx`, `src/css/global.css` | `src/main.tsx`, `src/style.css`：真实实现未验收；完整导航含关系图谱、折叠/主题/缩放/Debug 已实现 | 本轮 smoke 已通过导航与宽窄窗无整页横溢检查；smoke-preview/reference/narrow.png 已生成，常规/窄窗已目视检查；完整视觉对照仍待验收 |
| 导航右键独立开窗、预览独立窗 | layout、main.rs `open_navigation_window`, `open_file_preview_window` | `electron/main.ts`、`src/main.tsx`：全部页面导航右键独立开窗已实现；文件预览窗未迁移 | 本轮 smoke 验证第二窗口与导航；全页面逐项开窗与真实预览仍待验收 |
| Canvas 用户资料、Token 校验、普通/JI Canvas | settings、client/basic.rs | `core/canvas.ts`、`electron/canvas-session.ts`：真实实现未验收；SJTU/JI 学校登录窗、用户身份验证、Cookie 会话与注销已实现；手动 Canvas Token 校验未迁移 | 需真实账号本人登录验证；不能用录像 JWT 代替 Canvas 登录 |
| jAccount UUID/快捷认证、Canvas Cookie 会话、录像登录/HTML 表单重定向、LTI、JWT | app/video.rs、client/video.rs | Canvas 远程学校登录窗/Cookie 会话与手动录像 JWT 接入：真实实现未验收；录像 SSO/LTI 未迁移 | 不静默读取旧配置；旧 LTI 编码参数不能丢失 |
| 多账号创建、切换、删除、请求隔离、会话过期 | account_sessions.ts、account_transition.ts、app/basic.rs | 未迁移 | 切换失败恢复、进行中 AI/播放器隔离与旧会话失效待覆盖 |
| 学期/课程选择、课程分页及来源合并 | course_select.tsx、video_courses.ts | `core/canvas.ts` Canvas 课程/学期元数据、`core/service.ts` 录像空间课程 API：真实实现未验收；演示课程：演示 | teclId 已独立使用；尚无多来源合并与完整学期元数据验收 |
| 文件/个人文件夹、子目录、详情、搜索筛选选择 | files.tsx、course_file_selector.tsx | `core/canvas.ts` 课程文件列表：真实实现未验收；文件夹/个人目录/详情未迁移 | 文件夹分页、空态、权限与课程切换一致性 |
| 文件下载、批量/同步、保存/删除/打开目录 | files.tsx、file_download_table.tsx | 未迁移 | 保存目录、冲突、取消、失败重试、未知长度待覆盖 |
| 文件预览（PDF/Office/图片/视频/音频/文本/CSV/XLSX/压缩包/notebook） | components/*_renderer.tsx、preview_modal.tsx | 未迁移 | 原格式与增强预览会话、独立窗、清理资源 |
| 文档转换 PPTX/DOCX → PDF、PDF 合并（云盘 PDF 暂缓） | file_conversion.ts、pdf_tasks.ts、app/basic.rs | 未迁移 | 转换失败不能当认证失败；合并结果可单独另存 |
| 文件解释/流式问答、会话缓存、引文 | file_ai_chat_modal.tsx、file_ai_session.ts | 未迁移 | 密钥留后台，取消/切换隔离，流式错误 |
| 作业列表、筛选、详情、附件、我的提交/评论 | assignments.tsx、submit_modal.tsx | `core/canvas.ts` 作业列表：真实实现未验收；详情/附件/提交评论未迁移 | 读取可真实验收；提交及删除评论不为测试执行 |
| 作业附件上传与最终提交、绑定课程文件 | upload_submission_file、submit_assignment、course_assignment_file_bindings | 未迁移 | 最终学校写操作需明确授权；用 mock 回归 |
| 讨论主题与完整回复、参与者及未读 | discussions.tsx | `core/canvas.ts` 讨论主题列表：真实实现未验收；完整回复未迁移 | 当前原版为读取能力，不能虚构发帖功能已存在 |
| 日程月视图、课程颜色、范围筛选、截止提醒 | calendar.tsx | 未迁移 | 时区、日期边界、跨月请求 |
| 成员列表、选择、Excel/成员导出 | users.tsx、export_users、export_excel | `core/canvas.ts` 成员列表：真实实现未验收；导出未迁移 | 原版字段、编码与筛选一致 |
| 成绩总览/统计、导出、评分与评论 | grades.tsx、grade_overview/statistic.tsx | `core/canvas.ts` enrollment 成绩读取：真实实现未验收；统计/导出/批改未迁移 | 评分不得真实写入测试 |
| 提交批改、学生/作业切换、提交附件下载、批量处理 | submissions.tsx | 未迁移 | 迟到/未交与权限；批改写操作仅 mock |
| 截止日期与个别学生 override 增删改 | modify_ddl_modal.tsx | 未迁移 | 普通及 override 语义分开，真实修改须授权 |
| 教学大纲 HTML 与课程详情 | syllabus.tsx | `core/canvas.ts` 大纲读取：真实实现未验收；UI 安全显示源文本，富文本未迁移 | 富文本安全与附件链接 |
| 录像来源：Canvas、新录像空间、旧录像 | video_courses.ts、client/video.rs | `core/service.ts` 仅录像空间 JWT 列表：真实实现未验收 | 旧源/Canvas/LTI 未迁移；ID 命名空间不能混用 |
| 课节列表分页、日期分组、多选、跨折叠选择 | video_library.ts、video.tsx | 原型 1000 节上限显式报错；演示与真实适配均有 | 完整分页与课节分组未验收，不允许静默截断 |
| 播放器、多机位/轨道、独立状态、导航保活、引用跳转 | retained_video_workspace.tsx、video_library_player.tsx | 未迁移 | 播放权限、关闭清理、暂停/倍速/时间保留 |
| 直播与预告、HLS、机位、重连与截止时间 | video_live.ts、video_live_panel/player.tsx | 未迁移 | 签名 URL 编码与只允许受信目标代理 |
| 视频下载、全部轨道、FFmpeg 合并/输出 | video_track_downloads.tsx、video_aggregator.tsx | 未迁移 | 200/206 Range、无 Content-Length、断网与部分成功 |
| 原始字幕优先、空时优化回退、版本预览 | `core/subtitles.ts`, `core/service.ts` | 核心解析/回退：已验收（单元测试范围）；真实 HTTP：真实实现未验收；合成课堂：演示 | 5 项已有单元测试；权限/网络/格式错误不应回退；真实登录字幕待验收 |
| SRT 保存与文件名版本标识、另存、文本批量导出 | export_video_materials、download_subtitle | `electron/main.ts` SRT 写盘：真实实现未验收；文本/批量未迁移 | 历史 smoke 使用保存对话框替身并写盘；不等于人工保存验收 |
| PPT 切片/图片/PDF、动画清理与过滤报告 | app/ppt.rs、ppt_audit.rs | 未迁移 | 图片解码失败与权限区分；保留跳过原因 |
| OCR 文本/关键词、秒级时间与引文、无图资料 | client/video.rs、fixtures/ppt_*.json | 未迁移 | 0 秒与 createSec 秒值、OCR 结构变体必须回归 |
| 课堂问答/总结、压缩、思考/流式状态、缓存与重生成 | client/video_library.rs、video_summary_*.ts | 未迁移 | 模型/账号/课节/提示与预算隔离；OCR-only 材料 |
| 共享任务排队、去重、进度、取消/重试、部分失败、输出动作 | task_manager/runtime/hooks.ts、page_task_lists.tsx | 未迁移 | 不能把 renderer 本地历史表当跨窗口任务系统；最后 100% 仍等命令完成 |
| 交大云盘登录、普通/PDF 上传、重认证一次、上传进度 | app/jbox.rs、upload_tasks.ts | 暂缓，不开发 | 非当前验收条件 |
| 二维码图片检测/结果预览 | qrcode.tsx | 未迁移 | 无识别结果与接口错误分开 |
| 年度报告、课程/提交统计、导出图片/视频素材 | annual.tsx、app/annual.rs | 未迁移 | 年份边界、真实统计与导出文件 |
| 关系图谱 | relationship.tsx、collect_relationship | 未迁移 | 原版 router.tsx 有 /relationship，但默认侧栏未展示；仍保留最终范围 |
| Canvas Agent、多轮会话/工具、资料关联 | 原版历史功能 | 已移除，不再迁移 | 已删除重构导航及开窗许可，无实现或依赖 |
| MCP 启停/端口/工具 | 原版历史功能 | 已移除，不再迁移 | 重构项目无服务器、工具或依赖 |
| 系统设置完整字段、验证与保存 | settings.tsx、AppConfig | 未迁移（主题外壳不等于全设置） | 见下方字段映射；导入需备份与 schemaVersion |
| Debug、网络日志、诊断报告、脱敏与日志目录 | debug.tsx、diagnostics.rs | 未迁移 | 原始 Cookie/Token/LLM key/文件名不泄露 |
| 独立配置、旧账号显式导入、schemaVersion、备份 | app/basic.rs、需求文档 | 独立 userData（SJTU-Canvas-Rebuild-Electron-schema1）及 schema1 分区已实现，真实实现未验收；导入/备份未迁移 | 原配置不覆盖；不静默导入任何凭据 |
| 更新提示/检查、Windows 安装包、干净环境与平台适配 | update_notice.tsx、utils.tsx、tauri.conf.json | package 脚本存在，未验收 | 启动不等于 portable 安装包、更新或跨平台通过 |

## 原版设置字段逐项保留

以下字段从 `src/lib/model.ts:AppConfig` 与 `src/page/settings.tsx` 审查提取，除已移除 MCP 与暂缓云盘外，迁移默认 **未迁移**，不得因字段包含秘密而略掉功能；秘密改存后台加密存储即可。

| 类别 | 原版字段 | 迁移要求 |
|---|---|---|
| Canvas/账号 | token, account_type(Default/JI) | 分账号隔离、校验后切换；不回传 token |
| SSO/录像 | oauth_consumer_key, ja_auth_cookie, video_cookies, proxy_port | Cookie 与 JWT 后台持有；重定向/表单/LTI 完整支持 |
| 文件 | save_path, serve_as_plaintext, course_assignment_file_bindings | 校验目录及扩展名；绑定按账号/课程映射 |
| 提示与外观 | show_alert_map, theme, compact_mode, color_primary | 持久化、浅深色与主题色；不遗漏提示恢复 |
| 实验功能 | experimental_task_center_only, experimental_ppt_cleanup | 默认保持兼容原版，开启后真实生效 |
| LLM | llm_api_key, llm_base_url, llm_model, llm_temperature, llm_api_keys, llm_active_api_key | 多 Key/提供方/模型配置、旧字段迁移与余额查询；密钥脱敏 |
| 视频 AI | video_summary_prompt, video_summary_context_tokens, video_summary_output_tokens | 校验预算、恢复默认、隔离缓存 |
| Debug | debug_mode | Debug 导航按配置显示；MCP 设置不迁移 |

## 原版测试审查及迁移保护

原版测试作为行为规格审查，本轮未运行原版测试、未修改原版，也未使用真实学校写入做测试。

- 前端账号/AI：account_sessions、ai_sessions、llm_config、app_zoom、agent_navigation、file_ai_navigation/embedded、error_boundary。
- 任务：task_manager、task_runtime、task_hooks、upload_tasks、pdf_tasks、page_task_lists、video_library_tasks；覆盖并发/去重、失去订阅后继续、终态进度、重试、上传重认证、部分失败和保存结果。
- 视频：video_courses、video_library、video_live、video_summary_cache、retained_video_workspace、video_library_page/player、video_live_panel/player、video_summary_settings；覆盖来源/ID、学期合并、分组隐藏选择、导航保活、机位与 HLS 清理、summary/OCR 引文与缓存隔离。
- 诊断/文件：diagnostics、debug_diagnostics、log_modal、layout_feedback、file_conversion、code_renderer。
- Rust client/basic.rs：凭据端点、增强预览 web session、课程/大纲、提交分页与 HTTP 错误、评分 mock；部分真实测试明确 ignore，不能据此宣布真实验收。
- Rust client/video.rs：直播时序/权限、签名 URL、PPT 图片错误、OCR 多形状/0 秒、动画清理、teclId、旧 LTI 编码、SSO 表单与重定向、Range/206 下载探测；真实 get_uuid 测试 ignore。
- Rust client/video_library.rs、app/video_library.rs：素材整理、输出目录/文件名、材料导出和问答压缩/流式/预算；app/ppt.rs、ppt_audit.rs、model/video_summary.rs：PPT 过滤/OCR/总结配置。
- Rust diagnostics.rs、client/debug.rs：完整脱敏、日志容量、敏感网络字段和错误；app/cache.rs、app/basic.rs、app/mod.rs、utils/file.rs 的缓存/路径/转换基础行为仍需逐个移植。

本轮 10 项领域测试、两套 TypeScript 检查及 Vite 构建通过；新增 Canvas 测试采用固定响应，未使用学校真实账号。`tests/electron-smoke.cjs` 实际运行通过 renderer 隔离、preload IPC、第二窗口、字幕四类情况、UI 点击与主进程 SRT 写盘；保存对话框使用替身。`smoke-result.json` 明确 realAccountTested=false、nativeDialogTested=false。截图为 smoke-preview.png、smoke-reference.png（2283×1165）、smoke-narrow.png（640×800）；宽窄无整页横溢，仍非完整产品/视觉验收。未执行真实学校写入、原版测试、安装包或干净环境验收。

## 全量后端命令基线

下表自动从原版 `main.rs` 的 `tauri::generate_handler!` 注册清单提取，逐一保留。状态针对原版完整命令契约；字幕或列表部分实现不等于命令全部语义完成。本轮只读列表与学校登录集成映射已更新如下；全部真实学校接口仍未经账号验收。

| 原版命令 | 状态/迁移映射 |
|---|---|
| `read_log_content` | 未迁移 |
| `read_diagnostic_report` | 未迁移 |
| `save_diagnostic_report` | 未迁移 |
| `open_log_directory` | 未迁移 |
| `console_log` | 未迁移 |
| `is_ffmpeg_installed` | 未迁移 |
| `run_video_aggregate` | 未迁移 |
| `collect_relationship` | 未迁移 |
| `switch_account` | 未迁移 |
| `create_account` | 未迁移 |
| `delete_account` | 未迁移 |
| `read_account_info` | 未迁移 |
| `list_accounts` | 未迁移 |
| `list_courses` | 真实实现未验收：core/canvas.ts，CanvasApi 只读接口及 UI |
| `get_course_syllabus` | 真实实现未验收：core/canvas.ts，CanvasApi 只读接口及 UI |
| `list_user_submissions` | 未迁移 |
| `get_full_discussion` | 未迁移 |
| `list_discussion_topics` | 真实实现未验收：core/canvas.ts，CanvasApi 只读接口及 UI |
| `sync_course_files` | 未迁移 |
| `list_course_files` | 真实实现未验收：core/canvas.ts，CanvasApi 只读接口及 UI |
| `open_file_preview_window` | 未迁移 |
| `open_navigation_window` | 真实实现未验收：全部导航页面右键独立窗；第二窗口 smoke 通过，逐页待验收 |
| `list_course_images` | 未迁移 |
| `list_course_users` | 真实实现未验收：core/canvas.ts，CanvasApi 只读接口及 UI |
| `list_course_students` | 未迁移 |
| `list_course_assignments` | 真实实现未验收：core/canvas.ts，CanvasApi 只读接口及 UI |
| `list_course_assignment_submissions` | 未迁移 |
| `filter_course_qrcode_images` | 未迁移 |
| `get_single_course_assignment_submission` | 未迁移 |
| `export_excel` | 未迁移 |
| `list_folder_files` | 未迁移 |
| `list_course_folders` | 未迁移 |
| `list_my_folders` | 未迁移 |
| `list_folder_folders` | 未迁移 |
| `list_calendar_events` | 未迁移 |
| `test_token` | 未迁移 |
| `upload_submission_file` | 未迁移 |
| `submit_assignment` | 未迁移 |
| `get_me` | 真实实现未验收：CanvasApi.user()、CanvasSession 身份验证 |
| `get_folder_by_id` | 未迁移 |
| `get_colors` | 未迁移 |
| `get_config` | 未迁移 |
| `list_network_logs` | 未迁移 |
| `clear_network_logs` | 未迁移 |
| `get_raw_config` | 未迁移 |
| `save_config` | 未迁移 |
| `save_file_content` | 未迁移 |
| `open_course_file` | 未迁移 |
| `open_my_file` | 未迁移 |
| `open_file` | 未迁移 |
| `open_save_dir` | 未迁移 |
| `open_local_path` | 未迁移 |
| `open_config_dir` | 未迁移 |
| `delete_file` | 未迁移 |
| `delete_file_with_name` | 未迁移 |
| `delete_path_file` | 未迁移 |
| `save_path_file` | 未迁移 |
| `delete_course_file` | 未迁移 |
| `delete_my_file` | 未迁移 |
| `download_file` | 未迁移 |
| `download_course_file` | 未迁移 |
| `download_my_file` | 未迁移 |
| `download_course_file_as_pdf` | 未迁移 |
| `download_my_file_as_pdf` | 未迁移 |
| `check_path` | 未迁移 |
| `export_users` | 未迁移 |
| `update_grade` | 未迁移 |
| `delete_submission_comment` | 未迁移 |
| `delete_my_submission_comment` | 未迁移 |
| `modify_assignment_ddl` | 未迁移 |
| `modify_assignment_ddl_override` | 未迁移 |
| `add_assignment_ddl_override` | 未迁移 |
| `delete_assignment_ddl_override` | 未迁移 |
| `get_my_single_submission` | 未迁移 |
| `convert_pptx_to_pdf` | 未迁移 |
| `convert_docx_to_pdf` | 未迁移 |
| `get_uuid` | 未迁移 |
| `express_login` | 未迁移 |
| `get_canvas_videos` | 未迁移 |
| `get_video_live_sessions` | 未迁移 |
| `get_video_live_info` | 未迁移 |
| `list_video_space_courses` | 真实实现未验收：core/service.ts courses() |
| `get_video_space_videos` | 真实实现未验收：core/service.ts recordings()，显式 1000 节上限 |
| `get_legacy_videos` | 未迁移 |
| `login_canvas_website` | 真实实现未验收：electron/canvas-session.ts 学校远程登录窗与 Cookie 验证；非录像 LTI |
| `check_extra_login_status` | 未迁移 |
| `get_video_course` | 未迁移 |
| `get_video_info` | 未迁移 |
| `get_canvas_video_info` | 未迁移 |
| `get_video_play_info` | 未迁移 |
| `download_video` | 未迁移 |
| `login_video_website` | 未迁移 |
| `prepare_proxy` | 未迁移 |
| `stop_proxy` | 未迁移 |
| `download_subtitle` | 真实实现未验收：core/service.ts + electron/main.ts，当前仅 SRT 子集 |
| `prepare_video_material` | 未迁移 |
| `chat_video_materials` | 未迁移 |
| `export_video_materials` | 未迁移 |
| `create_video_export_directory` | 未迁移 |
| `download_ppt` | 未迁移 |
| `list_external_module_items` | 未迁移 |
| `login_jbox` | 暂缓，不开发 |
| `upload_file` | 未迁移 |
| `upload_file_as_pdf` | 未迁移 |
| `generate_annual_report` | 未迁移 |
| `chat` | 未迁移 |
| `canvas_agent_chat` | 已移除，不再迁移 |
| `check_balance` | 未迁移 |
| `explain_file` | 未迁移 |
| `chat_with_file` | 未迁移 |
| `start_file_chat_stream` | 未迁移 |
| `start_subtitle_chat_stream` | 未迁移 |
| `summarize_subtitle` | 未迁移 |
| `start_mcp_server` | 已移除，不再迁移 |
| `stop_mcp_server` | 已移除，不再迁移 |
命令总数：115。

## 已移除与暂缓范围

用户于 2026-10-29 明确永久删除 Canvas Agent/MCP，24 个原版 MCP 工具不再迁移；上方原版命令仅供审计，不构成开发要求。云盘登录、上传、云盘 PDF 工作流全部暂缓，不属于当前验收条件。原版参考项目不修改。

## 阶段验收规则

1. 外壳/会话：完整导航、设置入口与安全远程登录窗；真实身份读取、登录取消/过期/重新登录，不泄露凭据。新增 API 的 mock 测试通过仅能说明契约与错误处理。
2. Canvas 只读领域：课程、文件/文件夹、作业/提交、讨论、日程、成员、成绩/大纲；逐项补真实只读证据。
3. 下载/资料：统一后台任务，多窗口共享；视频/字幕/PPT/OCR、真实播放、另存/目录/重试/取消与部分失败。
4. 扩展：二维码/年度报告/关系图谱、完整设置/迁移/诊断、安装更新；持续保留未完成项。
5. 最终交付：所有条目均有对应证据，真实接口、UI 视觉对照、干净启动、开窗、打包测试分别记录，不以任何一个通过替代其他项目。


## 凭据与启动补充（2026-10-29）

Canvas个人Token的Bearer认证已接入core/canvas.ts、electron/canvas-session.ts、设置UI；先验证身份再切换，失败不覆盖当前会话。仅后台内存保存，真实账号未验收。录像JWT与Canvas Token明确区分并校验格式。run.ps1替代对全局pnpm的依赖，原版MUI Rounded导航SVG已复用（附许可）。15项测试、两套类型检查及构建通过，烟测覆盖SVG与Token IPC入口；仍不代表学校登录真实验收。


普通启动专项：run.ps1可见启动、窗口引用及ready-to-show、重复实例聚焦、独立sessionData已实现；tests/startup-smoke.ps1实际验证Windows可见窗口/启动器等待/正常关闭通过，证据logs/startup-result.json。专用烟测与普通启动证据分开，均非安装包验收。

## 2026-10-29 用户反馈后的验收更新

Canvas登录/课程、多窗口由用户报告大致正常，保留逐项验收限制。系统加密Token/Cookie/平台恢复、注销清除、失败不覆盖已有会话已实现；五个Electron进程真实safeStorage与Cookie测试通过（合成学校响应）。学期排序/筛选及缺名称辨识已实现，5项课程测试及UI切换/失败路径通过。新增SJTU Canvas会话兑换录像与JWT加密持久化；真实录像测试已运行但SSO阶段失败，不列为通过。详细证据、范围及限制见TEST-REPORT.md。Agent/MCP仍永久移除，云盘仍暂缓。


录像传输补验：本机真实302/Cookie测试通过，Session.fetch manual行为问题已修复为net.request；空白iframe回归通过。学校真实SSO返回需本人登录，未取得JWT，仍为真实实现未验收。


## 2026-10-30 更新

视频下载真实实现未验收：录像空间直链独立机位、共享后台队列/进度/取消/重试/去重、未知长度/200/完整206、断连检测、临时文件清理及冲突不覆盖已实现。HLS分段合并、其他来源和重启任务恢复未迁移。7项下载测试含真实本机HTTP服务通过，Electron固定数据集成验证下载IPC/文件写盘/跨窗任务通过（对话框/学校媒体为替身）。学校真实下载未验收。

课程5分钟、资料/课节/字幕60秒后台缓存，并发合并、手动强制刷新、账号变化清空；6项缓存测试通过。当前共41项领域测试、两套类型检查、构建及烟测通过；性能改善尚无学校环境量化计时。


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


## 2026-11-08 下载速率诊断与调度优化

真实短时测速仅使用本重构凭据：普通GET单连接0.346MiB/s（2.90Mbps），单Range0.499MiB/s，双Range合计0.832MiB/s；每样本6秒、最多4MiB，原应用仍运行，样本可能受其他活动下载影响，不能断言学校固定限速或承诺带宽。测速未写完整课节，也不输出签名URL/密钥；加密系统key仅在忽略的隔离测试profile使用，未改运行中Cookie或打断用户下载。报告logs/download-speed.json。

原下载器整批串行，现最多2个机位任务并行，单文件仍一条流，不是单文件分块加速；动态补充并发槽位，取消/退出等待清理保持不变。新增速率显示MiB/s和Mbps，区分累计大小和每秒速率，完成/取消清零。当前线路优化主要针对批量总吞吐，单视频速率仍受服务器/网络影响。

49项测试、两套类型检查、构建和隔离Electron烟测通过。新增本机HTTP并发计数回归（4文件最多同时2连接，均完成）。正在运行的旧应用不热更新，需等待下载结束后重启新版。未重复完整大视频下载，未重新打包本地portable。


## 2026-11-08 本地断点恢复实验（未提交、未推送）

延续用户“只测试、不提交”范围：下载器新增最多3次自动重连，1/2/4秒退避；每次重解析媒体地址。已有可信ETag或Last-Modified及总长度时，以Range和If-Range续传，并严格检查206起点、终点、长度与版本。服务器返回200忽略Range或版本变化时安全截断从零开始；无validator不盲拼；416重新起步而不误报完整。网络错误重试耗尽保留可信片段，手动重试同任务可继续；不对本地写盘失败盲目网络重试。

独立1秒速率计时，在网络静默时降为0。UI显示重连阶段、断点保留提示和“清除片段”。用户取消、退出、排队中的恢复任务取消都会清理对应片段；只支持当前进程内恢复，不支持重启后任务恢复。已有运行中的应用不热更新。

本地验证：59项测试、两套类型检查、构建、Electron隔离烟测通过。10项新增恢复/速率测试包含真实本机HTTP中途断连后精确文件对比、200安全重下、无validator策略、版本变化、错误Range、退避取消及shutdown清理。

实际学校媒体控制断流验证：问题课节218411从0下载，8MiB处注入连接中断；自动发送bytes=8388608-和If-Range，收到206后继续至少2MiB，断点左右64KiB与服务器独立Range读取完全相同。证据logs/car-resume-live-result.json。该项是学校真实数据+人为控制中断，不是四课节全量自然断流后的最终验收，不重复冒充完整大文件验证。

本轮未操作Git提交/推送、未更新Actions或Release，变化保留本地工作区，测试证据均在忽略的logs目录。


2026-11-10补验：ac8c689的Windows Actions全部成功，Artifact保留90天。新增连续三次断流精确拼接、Last-Modified回退和416安全重下回归，两套类型检查及62项测试、生产构建通过。真实未完成机位限量观察43.326秒、67633152字节，无注入、无超时重连；预算停止后part清理通过。自然断流长期稳定性和整课节回归仍未完成，详情见TEST-REPORT.md。


2026-11-10：下载任务新增最近10秒平均速率及单任务ETA，静默时速率归零并停止估算，重连/重下重置；65项测试、两套类型检查、构建及隔离Electron ETA显示烟测通过。学校自然断流长期验证仍未完成。文档统一整理至docs，入口见docs/README.md。


2026-11-10独立连接诊断：真实未完成课节230937机位1，300秒预算内复现两次自然静默30秒超时，两次206续传均恢复；首次断点64KiB独立校验一致。接收248.40MiB后按预算取消、part清理；未完成整视频，不代表多课程长期验收。新增run.ps1 stability按需入口，详情见TEST-REPORT.md和RUN-AND-TEST.md。
