# 任务 C：开发账号 Seed 与实库验收

2026-10-30（Asia/Shanghai），在 Node.js 24.22.1、npm 11.19.1 环境完成。

## 实现

- 仅新增直接依赖 `argon2`，同步更新 package-lock.json；未安装 JWT 依赖。
- 新增 `scripts/seed-dev-users.ts` 和 `npm run seed:dev`，未接入应用启动流程。
- 本地 Git 忽略的 `.env` 新增 32 字符随机开发专用 `DEV_SEED_PASSWORD`；密码和哈希均未写入文档或日志。
- 运行前检查 DB_NAME=workflow、DB_HOST 为 127.0.0.1 或 localhost、NODE_ENV 非 production、密码至少 12 个字符。连接后再核对 current_database()。
- 邮箱规范化为小写，按 LOWER(email) 查找已有账号，与数据库唯一索引规则一致。已有账号更新时保留 UUID，新账号生成 UUID；四个账号在同一事务中提交，成功后才打印账号准备完成。
- 每次运行均为每个账号独立调用 Argon2id 生成带随机盐的哈希。重复运行会重设这四个账号的姓名、邮箱、密码哈希、角色和激活状态。

Migration 负责一次性结构升级，不保存密码；Seed 按需初始化或更新开发数据。当前只完成账号资料和哈希准备，HTTP `POST /auth/login` 留待 Day 2。

## 两次实库执行

连续两次运行 `npm run seed:dev`，两次均输出四个账号准备成功，得到以下结果：

| email                  | role     | is_active | is_argon2id |
| ---------------------- | -------- | --------- | ----------- |
| approver1@example.test | APPROVER | true      | true        |
| approver2@example.test | APPROVER | true      | true        |
| employee1@example.test | EMPLOYEE | true      | true        |
| employee2@example.test | EMPLOYEE | true      | true        |

| 数据量         | Seed 前 | 第一次后 | 第二次后 |
| -------------- | ------- | -------- | -------- |
| 所有用户       | 2       | 6        | 6        |
| 四个 Seed 账号 | 0       | 4        | 4        |
| 工单           | 8       | 8        | 8        |
| 事件           | 5       | 5        | 5        |

两次执行后的账号 UUID 完全一致，每次四个密码哈希互不相同，第二次为每个账号重新生成了哈希。使用 `.env` 中的密码逐一执行 argon2.verify 均成功，错误密码均被拒绝。

对比非 Seed 用户、全部工单、全部事件的数据指纹，三者在执行前后完全一致。原有用户及工单关联没有被修改。

## 代码检查

- `npm test -- --runInBand`：88 项通过，其中新增 11 项 Seed 安全检查及失败处理测试。Controller 测试需要允许监听本地临时端口。
- `npm run lint`：通过，范围已包含 scripts。
- `npm run build`：通过。
- `npx --no-install tsc --noEmit --incremental false`：通过，包含 Seed 脚本的完整类型检查。
- Argon2 原生模块的实际 hash/verify 检查：通过。

新增测试覆盖非开发库、远程主机、生产环境拦截，密码缺失或过短，实际数据库名称不匹配或无返回行，数据库查询与事务失败时的连接清理，以及失败时不打印准备成功。
