# UK Rail History FastAPI Backend

本后端负责把 **Realtime Trains API token 留在服务端**，并向 React 前端提供受控的 `/api/*` 接口。

## 需要配置的变量

运行后端前，请在 shell 环境中设置以下变量，或在本地创建不提交的 `backend/.env` 文件：

| 变量 | 必填 | 示例 | 说明 |
|---|---:|---|---|
| `RTT_API_TOKEN` | 是 | `your_bearer_token` | 您在 `https://api.rtt.io/` 获得的 Realtime Trains bearer token。 |
| `RTT_BASE_URL` | 否 | `https://data.rtt.io/api/v1` | Realtime Trains API v1 基础 URL。 |
| `RTT_API_VERSION` | 否 | `2026-04-09` | OpenAPI 文档要求的版本标识。 |
| `RAIL_HISTORY_SQLITE_PATH` | 否 | `/home/ubuntu/uk-rail-history/rail_history.sqlite3` | SQLite 文件路径。 |
| `DATABASE_URL` | 否 | `sqlite:////home/ubuntu/uk-rail-history/rail_history.sqlite3` | 兼容 SQLite URL；若环境中存在 MySQL/PostgreSQL URL，本项目会自动忽略。 |

## 本地运行

```bash
cd /home/ubuntu/uk-rail-history
export RTT_API_TOKEN="粘贴您的 token"
python3.11 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

React 开发服务器已把 `/api` 代理到 `http://127.0.0.1:8000`，因此前端代码不会接触 token。
