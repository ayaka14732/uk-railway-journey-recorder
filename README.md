# UK Railway Journey Recorder

用最少的输入，自动补全英国火车旅程的全部信息，并储存到本地数据库。

## 项目目的

我以前记录英国铁路旅程的方式是手动录入 Google Sheet，每次都要填写大量字段，非常繁琐。

这个项目受到 [myFlightradar24](https://my.flightradar24.com/) 记录飞行历史的思路启发：只要输入出发站、到达站、大致上车时间，就能在 [Realtime Trains (RTT)](https://www.realtimetrains.co.uk/) 上查找候选车次；用户选择后，就能进一步自动获取该车次的运营商、计划时刻、实际时刻、晚点原因等全部详细信息。绝大多数字段不再需要手动填写。

## 项目设计

### 数据来源

[Realtime Trains](https://www.realtimetrains.co.uk/) 是英国铁路的实时与历史列车信息网站。付费订阅（£4）后可以查询过去 5 年内的所有车次信息。

RTT 提供 API，但即使是付费用户，使用 API 也只能查询最近 14 天的数据，不支持查询 5 年历史，因此本项目使用 web scraping：由后端直接请求 RTT 网页，用 BeautifulSoup4 解析 HTML，提取所需数据。

由于 RTT 需要登录后才能查看 14 天以前的历史数据，所以查询 14 天前的车次时，用户需要在前端页面手动填入自己的 RTT Cookie，后端会携带该 Cookie 去请求 RTT 网页。

### 数据库

使用 SQLite。本项目设计为个人本地使用，数据量有限，SQLite 已完全足够，无需额外部署数据库服务。

### 技术栈

| 层级   | 技术                          | 端口 |
|--------|-------------------------------|------|
| 前端   | TypeScript + React + Vite     | 3000 |
| 后端   | Python + FastAPI              | 8000 |
| 数据库 | SQLite（自动创建）            | —    |
| 爬虫   | requests + BeautifulSoup4     | —    |

Vite 开发服务器会将所有 `/api/*` 请求代理到后端（`:8000`），Cookie 不会暴露给浏览器之外。

## 运行方法

### 首次安装

```bash
# 安装前端依赖
pnpm install

# 创建 Python 虚拟环境并安装后端依赖
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

### 启动开发环境

需要同时开启两个终端：

```bash
# 终端 1：启动 FastAPI 后端
pnpm api

# 终端 2：启动 Vite 前端
pnpm dev
```

浏览器访问 http://localhost:3000，在页面顶部的 **Cookie** 输入框中粘贴你的 RTT Cookie 即可开始使用。

### 环境变量

| 变量                        | 必填 | 说明                                                                 |
|-----------------------------|------|----------------------------------------------------------------------|
| `RAIL_HISTORY_SQLITE_PATH`  | 否   | SQLite 文件路径；未设置时默认为项目根目录下的 `rail_history.sqlite3` |

## 其他

```bash
pnpm check    # TypeScript 类型检查
pnpm format   # Prettier 格式化
pnpm build    # 生产版本打包
```

本项目使用 Vibe Coding 开发，使用 [Manus AI](https://manus.im/) 编写，并使用 [Claude Code](https://claude.ai/code) 进行改进。
