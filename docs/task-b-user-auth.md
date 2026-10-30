# 任务 B：用户认证字段迁移与实库验收

2026-10-30（Asia/Shanghai），在原有 Compose 开发数据库 `workflow` 上完成升级，未运行 Seed。

## 备份与基线

先执行 `docker compose up -d db`，已有容器保持运行。随后使用 `pg_dump -Fc` 生成备份，并通过 `pg_restore --list` 检查归档目录包含三张业务表的数据。

本地运维产物位于项目外的 `../workflow-backups/`，不进入 Git：

- `workflow-before-day1-20261030T083445Z.dump`：升级前备份，9022 字节。
- `workflow-before-day1-20261030T083445Z.json`：升级前数据库标识、数量、旧数据指纹、前五张旧工单及其创建人、外键定义。
- `workflow-after-day1-20261030T083445Z.json`：升级后对比记录与新字段、约束检查结果。

## 实施结果

`UserEntity` 新增可空 email、默认不查询的可空 passwordHash、默认 EMPLOYEE 的 role、默认 false 的 isActive，并导出 UserRole 类型。既有用户、工单、事件关系保留。

新增 `AddUserAuthFields1793400000000`，未修改两条旧迁移。角色 CHECK 只允许 EMPLOYEE、APPROVER；邮箱唯一索引使用 `LOWER(email)`，仅覆盖非 NULL 邮箱。

升级前，原数据库仅记录了已执行的关系迁移，兼容初始表的 `CreateRequests1793000000000` 尚未登记。本次 `migration:run` 先执行其 `CREATE TABLE IF NOT EXISTS` 并登记，再执行认证字段迁移；已有 requests 表没有重建。

随后 `migration:show` 显示三条迁移均为 `[X]`，再次 `migration:run` 返回 `No migrations are pending`。

## 原库保留验证

| 检查项              | 升级前 | 升级后                   |
| ------------------- | ------ | ------------------------ |
| users 行数          | 2      | 2                        |
| requests 行数       | 8      | 8                        |
| request_events 行数 | 5      | 5                        |
| 既有外键            | 3 条   | 3 条，定义与验证状态一致 |

对比结果：容器 ID、数据库 OID、数据库名称、PostgreSQL 启动时间均一致，证明升级发生在原实例的原库上。三张表的全部旧字段按主键排序计算数据指纹，升级前后完全一致；旧工单样本的 ID、created_by、status 也完全一致。用户指纹仅包含原有 id、display_name、created_at，工单和事件指纹包含所有列。

`\d users` 确认四个新字段、角色约束与邮箱索引存在。两个历史用户均为 email=NULL、password_hash=NULL、role=EMPLOYEE、is_active=false。工单创建人、事件操作人、事件工单引用没有孤立记录。

## 验证命令

- `npm run build`：通过。
- `npm run lint`：通过。
- `npm test -- --runInBand`：77 项通过。
- `DB_NAME=workflow_test npm run migration:run`：独立测试库迁移成功。
- `DB_NAME=workflow_test npm run test:e2e -- --runInBand`：62 项通过。

新增 4 项真实数据库测试，覆盖仅姓名创建用户及多个 NULL 邮箱、默认值、普通查询隐藏密码哈希与显式查询读取、邮箱大小写冲突、非法角色。每项在独立事务中执行并回滚；只允许连接 workflow_test。既有工单流程与并发测试继续通过，故障注入用例中的约束错误日志为预期输出。

已实现 down，依次删除索引、约束、新增列；未在开发库执行回退。回退会丢失四个新字段的数据，不能用于无损重试迁移。
