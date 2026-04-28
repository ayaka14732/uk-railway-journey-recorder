# UK Rail History MVP Todo

- [x] 完成 SBB 风格 React 首页，包含查询表单、候选车次列表、详情面板和历史记录。
- [x] 联调 `/api/search-services`、`/api/resolve-service`、`/api/journeys` 的前端调用与错误处理。
- [x] 运行 TypeScript 与生产构建检查，修复阻塞问题。
- [x] 保存最终 checkpoint，并向用户说明如何配置 `RTT_API_TOKEN` 与启动后端。

## RTT Token Validation

- [x] 使用运行时环境变量为本地 FastAPI 后端注入用户提供的 RTT token，避免修改受保护环境文件。
- [x] 重启 FastAPI 后端并确认 `/api/health` 显示 RTT 已配置。
- [x] 使用 2026-04-27 MKC → EUS 18:55 示例查询真实 RTT 候选车次。
- [x] 修复 refresh token 自动交换与 RTT 基础地址问题后，已通过后端语法检查、TypeScript 检查和生产构建；等待保存 checkpoint。

## Dense SBB Interface Redesign

- [x] 移除首页所有图片与图片相关布局，保留 SBB 红白黑配色和硬朗分隔线。
- [x] 将页面改成高密度铁路运行表/ledger 布局，减少首屏大标题、留白和大卡片。
- [x] 查询表单改为紧凑横向控制条，日期、起站、终站、时间尽量一行展示。
- [x] 候选车次列表改为一条 item 一行，显示时间、车次、运营商、起终点、延误状态。
- [x] 历史记录改为一条 item 一行，显示日期、乘车区间、计划/实际时间、发到延误和保存状态。
- [x] 运行 TypeScript 与生产构建检查并保存新 checkpoint。

## Search 500 Regression

- [x] Investigate and fix 500 error when clicking the search button in the compact SBB ledger UI.
- [x] Validate `/api/search-services` with the current default MKC → EUS request after the fix.
- [x] Save a new checkpoint after resolving the 500 error.

## Token Reconnection After 500 Report

- [x] Store the user-provided RTT token in local backend environment configuration without exposing it in user-facing output.
- [x] Restart the FastAPI backend and confirm `/api/health` reports RTT configured.
- [x] Validate the search button path through `/api/search-services` and confirm it returns candidate services instead of 500.
- [x] Save a corrected checkpoint after passing TypeScript/build checks.

## Plain English Interface Revision

- [x] Remove all non-English interface text and remove language-switching UI.
- [x] Replace the high-contrast presentation with a plain, normal, simple web page while keeping the red/black/white colour family.
- [x] Remove animations and avoid advanced decorative CSS.
- [x] Remove platform information from candidate and history displays.
- [x] Show both booked/actual departure and booked/actual arrival points where data is available.
- [x] Show departure delay and arrival delay as separate values.
- [x] Remove the service detail panel; clicking Add should save the selected journey directly to the database.
- [x] Validate search, direct add, history refresh, TypeScript check, and production build before saving a checkpoint.
