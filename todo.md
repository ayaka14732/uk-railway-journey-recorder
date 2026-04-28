# UK Rail History MVP Todo

- [x] 完成 SBB 风格 React 首页，包含查询表单、候选车次列表、详情面板和历史记录。
- [x] 联调 `/api/search-services`、`/api/resolve-service`、`/api/journeys` 的前端调用与错误处理。
- [x] 运行 TypeScript 与生产构建检查，修复阻塞问题。
- [ ] 保存最终 checkpoint，并向用户说明如何配置 `RTT_API_TOKEN` 与启动后端。

## RTT Token Validation

- [x] 使用运行时环境变量为本地 FastAPI 后端注入用户提供的 RTT token，避免修改受保护环境文件。
- [x] 重启 FastAPI 后端并确认 `/api/health` 显示 RTT 已配置。
- [x] 使用 2026-04-27 MKC → EUS 18:55 示例查询真实 RTT 候选车次。
- [x] 修复 refresh token 自动交换与 RTT 基础地址问题后，已通过后端语法检查、TypeScript 检查和生产构建；等待保存 checkpoint。
