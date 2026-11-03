# 投投管理后台

与 taro-api 共用腾讯云 MySQL 库 `taro`，用来发布商品、维护业务表。

## 启动

1. 复制环境变量：`cp .env.example .env.local`，改掉管理员密码，并填写与 taro-api 相同的数据库连接。
2. `pnpm dev`，打开 http://localhost:3002 。
