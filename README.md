# UK Rail History

記錄英國火車旅程的個人工具。查詢 [Realtime Trains](https://api.rtt.io/) 取得列車時刻與誤點資料，並儲存至本地 SQLite。

## 架構

| 層級 | 技術 | 埠號 |
|------|------|------|
| 前端 | React + TypeScript + Vite | 3000 |
| 後端 | FastAPI + Python 3.11 | 8000 |
| 資料庫 | SQLite（自動建立） | — |

Vite 開發伺服器會自動把 `/api/*` 請求代理到後端（`:8000`），API token 不會暴露給瀏覽器。

## 前置需求

- Node.js 18+，pnpm（`npm i -g pnpm`）
- Python 3.11
- Realtime Trains API token（在 [api.rtt.io](https://api.rtt.io/) 申請）

## 首次設定

```bash
# 安裝前端相依套件
pnpm install

# 建立 Python 虛擬環境並安裝後端相依套件
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

API token 在瀏覽器介面裡輸入，存在 `localStorage`，不需要後端設定檔。

## 啟動開發環境

需要開兩個終端機：

```bash
# 終端機 1：啟動 FastAPI 後端
pnpm api

# 終端機 2：啟動 Vite 前端
pnpm dev
```

瀏覽器開啟 http://localhost:3000，在頁面頂部的 **RTT Key** 欄位貼上你的 bearer token 即可使用。

## 可選的後端環境變數

後端支援從環境變數讀取 token 作為 fallback（適合伺服器部署）。在 `backend/.env` 設定：

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `RTT_API_TOKEN` | — | 伺服器端 fallback token（前端傳入的 token 優先） |
| `RTT_BASE_URL` | `https://data.rtt.io` | RTT API 基礎位址 |
| `RTT_API_VERSION` | `2026-04-09` | RTT API 版本 |
| `RAIL_HISTORY_SQLITE_PATH` | `rail_history.sqlite3`（專案根目錄） | SQLite 檔案路徑 |

## 其他指令

```bash
pnpm build    # 生產版本打包
pnpm check    # TypeScript 型別檢查
pnpm format   # Prettier 格式化
```
