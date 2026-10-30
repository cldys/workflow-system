# 状态机与业务规则

本文记录当前已实现的业务行为。第三周计划引入的角色、资源归属与响应约定见[权限规则](permissions.md)，当前尚未生效。

## 状态与允许操作

| 状态     | 含义         | 允许的状态变化                        |
| -------- | ------------ | ------------------------------------- |
| DRAFT    | 草稿         | submit → PENDING                      |
| PENDING  | 待审批       | approve → APPROVED；reject → REJECTED |
| APPROVED | 已通过，终态 | 无                                    |
| REJECTED | 已驳回，终态 | 无                                    |

创建产生 DRAFT。当前不支持撤销、重新提交已驳回工单、编辑或删除；重复提交、重复审批及其他非法转换均为 `409 / INVALID_STATUS_TRANSITION`。

## 输入与操作人

- 创建标题为包含非空白字符的字符串，最多 120 字符；描述可选，未提供或为 null 时存 null。未知请求体字段被拒绝。
- 所有写接口要求 `X-Demo-User-Id` 是有效 UUID，且对应 users 中的用户；格式错误或缺失返回 400，用户不存在返回 404。
- 驳回请求字段为 `reason`，必须为包含非空白字符的字符串且原始长度不超过 500。Service 去除首尾空白，再保存到事件 `note`。
- 当前没有认证与权限限制：服务不要求提交人就是创建人，也不强制审批人与创建人不同。演示请求头不代表可信身份。

## 事件与事务

| 操作 | action    | fromStatus | toStatus | note                  |
| ---- | --------- | ---------- | -------- | --------------------- |
| 创建 | CREATED   | null       | DRAFT    | null                  |
| 提交 | SUBMITTED | DRAFT      | PENDING  | null                  |
| 通过 | APPROVED  | PENDING    | APPROVED | null                  |
| 驳回 | REJECTED  | PENDING    | REJECTED | 去除首尾空白的 reason |

每条事件保存 requestId 和实际 actorId。历史按 `createdAt ASC, id ASC` 返回。创建、提交、决策分别在独立事务中进行，必须通过事务 manager 获取 Repository。工单写入与事件插入同成同败；后续事件写入失败会撤销本次状态更新，保留之前已提交的数据。

提交以数据库状态 DRAFT 为 UPDATE 条件；审批和驳回以 PENDING 为条件。只有 `affected = 1` 才写入事件，其他存在的工单返回 409。提交还保留前置状态检查，但真正的并发保护来自条件 UPDATE。更新失败后若查询发现工单已不存在，返回 404。

两个并发决策只能有一个成功，最终状态与唯一决策事件、获胜操作人一致；并发提交也只能产生一个 SUBMITTED 事件。非法转换不改变工单、更新时间或历史。状态规则由 Service 执行，数据库 status/action 字段目前没有枚举 CHECK 约束。

## 验证边界

单元测试检查条件更新参数与事件写入；真实 PostgreSQL e2e 检查非法操作前后数据、CHECK 故障回滚、完整流程及并发竞争。20 轮并发测试不穷尽所有竞态，未设置精确控制 SQL 调度的同步屏障。
