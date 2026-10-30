# 数据库与迁移

使用 PostgreSQL，业务表为 users、requests、request_events。UUID 主键默认 `gen_random_uuid()`；时间使用 timestamptz、默认 NOW()。TypeORM 管理 requests.updated_at 的更新，数据库没有对应自动更新时间的触发器。

## 三张业务表

| 表             | 字段                                                                                                                                           | 约束与说明                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| users          | id uuid；display_name varchar(100)；email varchar(255)；password_hash text；role varchar(20)；is_active boolean；created_at timestamptz        | email、password_hash 可空；role 默认 EMPLOYEE；is_active 默认 false；其余非空         |
| requests       | id uuid；title varchar(120)；description text；status varchar(20)；created_by uuid；created_at、updated_at timestamptz                         | description 可空，其余非空；status 默认 DRAFT；created_by 外键指向 users.id           |
| request_events | id uuid；request_id uuid；actor_id uuid；action varchar(30)；from_status varchar(20)；to_status varchar(20)；note text；created_at timestamptz | from_status、note 可空，其余非空；request_id、actor_id 分别引用 requests.id、users.id |

users → requests 为创建人一对多；users → request_events 为操作人一对多；requests → request_events 为工单历史一对多。三条外键均为 `ON DELETE RESTRICT`。HTTP 响应使用 createdById、requestId、actorId 等驼峰属性，数据库列使用下划线。

用户认证字段目前仅作为后续登录功能的数据库基础，不改变现有 `X-Demo-User-Id` 行为。`CHK_users_role` 限制角色只能为 `EMPLOYEE` 或 `APPROVER`；`IDX_users_email_unique_ci` 对非空邮箱的 `LOWER(email)` 建立唯一索引，因此邮箱唯一性不区分大小写，且允许多个 NULL。后续登录查询应采用相同的邮箱规范化策略。

`passwordHash` 配置 `select: false`，普通 TypeORM 查询默认不读取，登录时需显式 `addSelect('user.passwordHash')`。这不能替代安全的响应 DTO。历史用户的邮箱和密码哈希保持 NULL，角色为 EMPLOYEE，is_active 为 false。

status、action 目前为普通字符串，业务状态约束由 Service 实现。历史按 created_at ASC、id ASC 查询；当前未建立额外的历史查询索引。数据库还包含 TypeORM 的 migrations 元数据表，不属于三张业务表。

## 空数据库初始化

先创建空数据库并配置 README 中的 DB_*，然后在仓库根目录执行：

```bash
npm run migration:run
npm run migration:show
```

DataSource 加载 `src/database/migrations/*.ts`，按时间戳执行：

1. `CreateRequests1793000000000`：创建初始 requests 表，与第一周 `db/001_init.sql` 定义一致。IF NOT EXISTS 兼容已按旧 SQL 初始化的表，不会修复任意不匹配的已有表。
2. `AddWorkflowRelations1793104789066`：创建 users，添加 requests.created_by，创建专用历史迁移用户并回填旧工单，设置 NOT NULL 与外键，创建 request_events。
3. `AddUserAuthFields1793400000000`：通过 ALTER TABLE 在原 users 表上增加 email、password_hash、role、is_active，添加角色 CHECK 和邮箱唯一表达式索引，不修改旧记录的 ID 或引用关系。实库升级验收见[任务 B 记录](task-b-user-auth.md)。

迁移用户 ID 为 `00000000-0000-4000-8000-000000000001`。它用于标识旧工单归属，不会为旧工单补造 CREATED 历史。迁移执行记录存入 migrations 表；再次运行跳过已执行项。`synchronize: false` 必须保留。

测试库使用：

```bash
DB_NAME=workflow_test npm run migration:run
DB_NAME=workflow_test npm run test:e2e -- --runInBand
```

## 已有数据库与回退

- 已运行第一周初始化 SQL、尚未做关系迁移：直接运行迁移链；初始迁移跳过已有 requests 表，关系迁移继续升级。
- 已通过 TypeORM 执行关系迁移：现有记录保留，新补的初始迁移会登记，requests 不会重建。
- 已手工创建完整三表但没有迁移记录：先审查实际表结构和基线记录，不能直接重复执行关系迁移。不要为了绕过冲突开启 synchronize。

不要修改已应用的迁移。down 按反序撤销：认证字段迁移先删除邮箱索引和角色约束，再删除四个新增列；关系迁移删除事件、创建人列和用户表；初始迁移删除 requests。认证字段回退会丢失邮箱、密码哈希、角色与激活信息。回退会丢失相应数据，且初始迁移无法区分自己创建的表与旧 SQL 创建的表。仅在确认可丢弃的环境或完成备份和审核后执行回退；日常升级只运行前向迁移。

数据库备份属于本地运维产物，不进入 Git。测试故障 CHECK 约束只在 workflow_test 中临时创建，限定单张测试工单并在 finally 删除；它不属于正式迁移。
