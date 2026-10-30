# 工单审批系统

基于 NestJS、TypeScript、PostgreSQL 和 TypeORM 的工单 API。支持创建、列表、详情、提交、审批通过、审批驳回和历史查询；状态修改与事件记录使用同一事务，条件 UPDATE 防止重复提交或重复决策。

当前使用 `X-Demo-User-Id` 模拟操作人，尚无身份认证、角色授权、用户管理接口、工单修改或删除接口。列表没有分页和默认排序。

## 文档

- [业务规则与状态机](docs/business-rules.md)
- [七个 API 契约与错误码](docs/API.md)
- [数据库、关系与迁移](docs/database.md)
- [任务 B：用户认证字段迁移与实库验收](docs/task-b-user-auth.md)
- [任务 C：开发账号 Seed 与实库验收](docs/task-c-dev-users.md)
- [第二周工程记录与验证结果](docs/week-2-engineering.md)

## 环境与启动

本项目验证环境为 Node.js 24、npm 11、PostgreSQL 17。在项目根目录执行：

```bash
npm ci
```

创建本地 `.env`（已被 Git 忽略），使用自己的数据库密码：

```dotenv
DB_HOST=127.0.0.1
DB_PORT=5433
DB_USER=workflow
DB_PASSWORD=<填写本地数据库密码>
DB_NAME=workflow
PORT=3000
```

运行时环境变量优先于 `.env`。所有 `DB_*` 都必须提供，数据库需预先存在。

使用仓库 Compose 启动本地 PostgreSQL：

```bash
docker compose up -d db
```

Compose 新卷会创建 `workflow` 数据库和同名用户，端口只绑定本机 `5433`。已有卷不会因修改环境变量而更改数据库密码；若已有实例，使用其实际连接配置。启动后等待数据库就绪，再执行迁移：

```bash
npm run migration:run
npm run migration:show
npm run start:dev
```

迁移可直接从空数据库创建三张业务表；重复执行不会重复应用已记录的迁移。保持 `synchronize: false`，启动应用不会自动创建表，也不会自动运行迁移。不要手工重复执行关系迁移 SQL。已有数据库的接入方式见数据库文档。

编译运行：

```bash
npm run build
npm run start:prod
```

检查 `http://localhost:3000/` 返回 `Hello World!`，`GET /requests` 返回数组。

## 第一个业务请求

在数据库 SQL 客户端执行以下语句创建演示用户，记下返回的 UUID；系统没有创建用户的 HTTP 接口：

```sql
INSERT INTO users (display_name) VALUES ('演示操作人') RETURNING id;
```

将返回值设为 `ACTOR_ID`，然后发送请求：

```bash
export ACTOR_ID='<上一步返回的 UUID>'
curl -i http://localhost:3000/requests \
  -H 'Content-Type: application/json' \
  -H "X-Demo-User-Id: $ACTOR_ID" \
  -d '{"title":"采购申请","description":"办公用品"}'
```

预期 `201`、状态 `DRAFT`。操作人通过请求头传递，不能在请求体提交 `createdById`；完整提交、审批和驳回示例见 API 文档。

## 开发测试账号

Migration 负责修改数据库结构，Seed 负责初始化开发数据。先执行迁移，再在本地 `.env` 添加 `DEV_SEED_PASSWORD`，使用至少 12 个字符的随机开发专用密码，然后运行：

```bash
npm run seed:dev
```

脚本准备 `employee1@example.test`、`employee2@example.test` 两个员工和 `approver1@example.test`、`approver2@example.test` 两个审批人，均激活。四个账号共用该开发密码，但每个账号独立生成 Argon2id 带盐哈希。脚本不打印密码或哈希。

仅允许本地 `127.0.0.1` / `localhost` 上的 `workflow` 数据库，且 `NODE_ENV` 不能是 `production`。重复执行会更新这四个账号的姓名、邮箱、密码哈希、角色和激活状态，保留已有 UUID；四个账号在同一事务中提交。Seed 不会由应用启动自动调用，目前尚未实现 HTTP 登录。

## 测试与检查

单元和 Controller 测试使用 Mock，不依赖 PostgreSQL：

```bash
npm test -- --runInBand
```

真实数据库 e2e 只允许连接名为 `workflow_test` 的数据库。在本地 Compose 数据库就绪后，首次创建并迁移测试库：

```bash
docker compose exec db createdb -U workflow workflow_test
DB_NAME=workflow_test npm run migration:run
DB_NAME=workflow_test npm run test:e2e -- --runInBand
npm run lint
npm run build
DB_NAME=workflow_test npm run test:e2e -- --runInBand
```

已存在的测试库跳过 `createdb`。外部 PostgreSQL 可用 SQL 客户端创建同名空库，迁移和测试时覆盖对应连接变量。测试账号需有测试库建表、修改表及数据读写权限。

e2e 覆盖两条完整业务流程、9 种非法转换、真实 CHECK 故障回滚、20 轮并发决策和20 轮并发提交，并清理本次创建的用户、工单和事件。故障注入测试预期输出约束错误日志，但客户端仅收到通用 500；临时约束在 `finally` 中移除。不要将测试连接指向业务库。

## 排错与配置安全

- 连接拒绝：检查 PostgreSQL 状态、主机和端口。
- 认证失败：检查本地 `.env` 与已有数据库账号，Compose 不会重置已有卷密码。
- 数据库不存在：先创建目标数据库。
- 表不存在：对正确数据库运行 `npm run migration:run`。
- `USER_NOT_FOUND`：请求头 UUID 对应的用户必须先存在。

不要提交 `.env`、数据库备份、密码或密钥。Compose 从环境变量读取密码。历史迁移用户只用于旧数据归属，不是真实员工。详情见数据库文档。
