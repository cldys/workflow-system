# 工单 API 契约

默认地址 `http://localhost:3000`。JSON 请求使用 `Content-Type: application/json`。所有写接口必须携带 `X-Demo-User-Id`（已存在用户的 UUID）；读取接口不要求此请求头。`:id` 必须是有效 UUID。

## 七个接口

| 方法与路径                 | 请求体                                               | 成功响应                         | 业务条件                                             |
| -------------------------- | ---------------------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| POST /requests             | `{ "title": "采购申请", "description": "办公用品" }` | 201，工单对象，DRAFT             | title 非空白且最长120，description 可选字符串或 null |
| GET /requests              | 无                                                   | 200，工单对象数组，空列表为 `[]` | 无分页、筛选和固定顺序                               |
| GET /requests/:id          | 无                                                   | 200，工单对象                    | 工单存在                                             |
| POST /requests/:id/submit  | `{}`                                                 | 200，更新后工单对象，PENDING     | DRAFT                                                |
| POST /requests/:id/approve | `{}`                                                 | 200，更新后工单对象，APPROVED    | PENDING                                              |
| POST /requests/:id/reject  | `{ "reason": "采购预算不足，需要调整" }`             | 200，更新后工单对象，REJECTED    | PENDING，reason 非空白且原始长度≤500                 |
| GET /requests/:id/events   | 无                                                   | 200，事件对象数组                | 工单存在，按 createdAt、id 升序                      |

创建与驳回 DTO 拒绝未知字段；submit/approve 没有请求体 DTO，调用时发送空对象。不要从客户端提交 id、status、createdById 或时间戳。

工单响应示例（其他状态变更接口沿用相同结构）：

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "采购申请",
  "description": "办公用品",
  "status": "DRAFT",
  "createdById": "550e8400-e29b-41d4-a716-446655440001",
  "createdAt": "2026-10-30T06:00:00.000Z",
  "updatedAt": "2026-10-30T06:00:00.000Z"
}
```

列表返回上述对象的数组，不自动附带用户和历史关系对象。历史中的每条事件结构如下：

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "actorId": "550e8400-e29b-41d4-a716-446655440002",
  "action": "REJECTED",
  "fromStatus": "PENDING",
  "toStatus": "REJECTED",
  "note": "采购预算不足，需要调整",
  "createdAt": "2026-10-30T06:01:00.000Z"
}
```

历史 action 为 CREATED、SUBMITTED、APPROVED 或 REJECTED。CREATED 的 fromStatus 为 null；非驳回事件 note 为 null。完整审批或驳回流程均产生3条事件。

## 调用示例

先按 README 在数据库创建用户。以下占位符须替换为真实 UUID，创建成功后从响应复制工单 ID：

```bash
export BASE_URL='http://localhost:3000'
export ACTOR_A='<创建人 UUID>'
export ACTOR_B='<审批人 UUID>'
curl -i "$BASE_URL/requests" -H 'Content-Type: application/json' \
  -H "X-Demo-User-Id: $ACTOR_A" -d '{"title":"采购申请"}'
export REQUEST_ID='<创建响应中的工单 UUID>'
curl -i "$BASE_URL/requests"
curl -i "$BASE_URL/requests/$REQUEST_ID"
curl -i -X POST "$BASE_URL/requests/$REQUEST_ID/submit" \
  -H "X-Demo-User-Id: $ACTOR_A"
curl -i -X POST "$BASE_URL/requests/$REQUEST_ID/approve" \
  -H "X-Demo-User-Id: $ACTOR_B"
curl -i "$BASE_URL/requests/$REQUEST_ID/events"
```

驳回使用另一张已提交为 PENDING 的工单（不能再驳回上面已通过的工单）：

```bash
export REQUEST_ID='<另一张 PENDING 工单 UUID>'
curl -i "$BASE_URL/requests/$REQUEST_ID/reject" \
  -H 'Content-Type: application/json' -H "X-Demo-User-Id: $ACTOR_B" \
  -d '{"reason":"采购预算不足，需要调整"}'
curl -i "$BASE_URL/requests/$REQUEST_ID/events"
```

## 错误响应

统一结构示例：

```json
{
  "statusCode": 409,
  "code": "INVALID_STATUS_TRANSITION",
  "message": "当前工单状态不允许执行此操作",
  "path": "/requests/550e8400-e29b-41d4-a716-446655440000/approve"
}
```

| HTTP | code                      | 触发场景                                                  |
| ---- | ------------------------- | --------------------------------------------------------- |
| 400  | INVALID_UUID              | 工单路径 ID 格式错误                                      |
| 400  | INVALID_ACTOR_ID          | 写接口操作人请求头缺失或 UUID 格式错误                    |
| 400  | VALIDATION_FAILED         | DTO 校验失败、未知请求体字段；多个信息合并到 message      |
| 400  | BAD_REQUEST               | 其他 BadRequestException，例如 Service 的 reason 防御校验 |
| 404  | REQUEST_NOT_FOUND         | 工单不存在                                                |
| 404  | USER_NOT_FOUND            | 操作人 UUID 有效但用户不存在                              |
| 404  | RESOURCE_NOT_FOUND        | 路由不存在等其他404                                       |
| 409  | INVALID_STATUS_TRANSITION | 非法状态、重复操作或并发竞争失败                          |
| 500  | INTERNAL_SERVER_ERROR     | 数据库错误等未预期异常；message 固定为“服务器内部错误”    |

Filter 的其他默认码为 CONFLICT（409）、HTTP_ERROR（其他状态）；显式业务 code 优先。500 内部详情只记录在服务器日志，不返回 SQL、约束名或堆栈。参数错误的优先级依照 Nest 参数管道执行顺序，不承诺同时存在多个错误时返回哪一项。
