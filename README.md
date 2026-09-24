# 投投管理后台

与 taro-api 共用 SQLite，用来发布商品、维护业务表。

## 启动

1. 复制环境变量：`cp .env.example .env.local`，改掉管理员密码。
2. 确认 `SQLITE_PATH` 指向 taro-api 的 `data/app.sqlite`。
3. `pnpm dev`，打开 http://localhost:3002 。
