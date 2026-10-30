# Day 1 工程验收

2026-10-30（Asia/Shanghai）完成任务 D 验收。权限设计见 [permissions.md](permissions.md)，数据库升级与开发账号的实库记录分别见[任务 B](task-b-user-auth.md)和[任务 C](task-c-dev-users.md)。

## 执行结果

按以下顺序执行，所有命令退出码均为 0：

| 命令                                                    | 结果                                                      |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `DB_NAME=workflow_test npm run migration:run`           | `No migrations are pending`，既有隔离测试库已应用全部迁移 |
| `npm test -- --runInBand`                               | 4 个测试套件、88 项测试通过                               |
| `DB_NAME=workflow_test npm run test:e2e -- --runInBand` | 3 个测试套件、62 项测试通过                               |
| `npm run lint`                                          | 通过，检查 src、test、scripts                             |
| `npm run build`                                         | 通过                                                      |

迁移和 e2e 均显式指定 `workflow_test`；没有删除或重建测试库，没有将 e2e 指向 `workflow` 开发数据库。测试需要访问本地 PostgreSQL，并允许 Supertest 监听临时本地端口。

## 兼容性结论

第二周工单 e2e 仍通过仅提供 displayName 的方式创建临时用户，未要求邮箱或密码。用户认证字段 e2e 同时确认多个 NULL 邮箱可共存，新建无邮箱用户的默认角色为 EMPLOYEE、is_active 为 false，普通查询不读取密码哈希。

完整工单流程、非法状态流转、事务故障回滚和并发提交及决策继续通过。故障注入用例触发 request_events 临时 CHECK 约束时，服务器按预期输出错误日志；该日志不代表测试失败。临时约束和本次测试数据由既有测试清理。

本次结果支持实体及数据库升级兼容已有工单行为。它不验证尚未实现的登录、角色 Guard 或资源权限；permissions.md 中的第三周约定尚未生效。
