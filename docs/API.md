# 登录与工单 API 契约

本文描述当前已实现的接口。登录已支持密码验证与 JWT 签发，所有工单接口已接入 JWT 认证；角色与资源权限规则见[权限规则](permissions.md)，这些授权规则尚未生效。

默认地址 `http://localhost:3000`。JSON 请求使用 `Content-Type: application/json`。所有工单接口（含列表、详情和历史）必须携带 `Authorization: Bearer <token>`；`X-Demo-User-Id` 不再作为身份来源。`:id` 必须是有效 UUID。

## 登录

`POST /auth/login` 不需要 Bearer Token，请求体为：

```json
{
  "email": "employee1@example.test",
  "password": "<填写账号密码>"
}
```

邮箱必须合法且最长 255 字符；密码必须为非空字符串且最长 1024 字符。拒绝未知字段，登录不检查注册密码复杂度，也不修改密码内容。邮箱查询会转小写并去除首尾空格，但 HTTP DTO 会拒绝带首尾空格的邮箱。

成功返回 HTTP 200：

```json
{
  "accessToken": "<JWT>",
  "tokenType": "Bearer",
  "expiresIn": 1800
}
```

`expiresIn` 的单位为秒。Token 使用 HS256，有效期 1800 秒（30 分钟），仅包含用户 ID（`sub`）、签发和到期时间（`iat`、`exp`）、签发方（`iss`，值为 `workflow-system`）与接收方（`aud`，值为 `workflow-api`）。`iat`、`exp`、`iss`、`aud` 由签名配置自动生成。Token 不包含角色、用户资料、密码或哈希；每次访问工单接口时根据 `sub` 从数据库查询最新角色与激活状态。启动前须配置 `JWT_SECRET`。

`JwtAuthGuard` 使用 `JwtService.verifyAsync()` 验证签名、到期时间和 nbf，显式限制 `algorithms: ['HS256']`、`issuer: 'workflow-system'`、`audience: 'workflow-api'`；不接受缺少到期时间的 Token。通过验证后检查 `sub` 为用户 UUID，再查询数据库，只有存在且激活的账号才将 `{ id, role }` 写入 `request.user`。`@CurrentUser()` 只读取该认证结果，Controller 将其中的用户 ID 传入 Service，忽略客户端提供的演示操作人或 Token 中的角色。身份来源固定为 `JWT 验证结果 → 数据库用户 → request.user → Controller → Service`。

格式错误返回 400 / `VALIDATION_FAILED`。邮箱不存在、密码错误、账号未激活、密码哈希缺失或无效，均返回相同的认证失败响应：

```json
{
  "statusCode": 401,
  "code": "INVALID_CREDENTIALS",
  "message": "邮箱或密码错误",
  "path": "/auth/login"
}
```

职责链为 `AuthController → AuthService → UsersService → TypeORM Repository → PostgreSQL`：Controller 接收请求，UsersService 通过参数化查询显式读取隐藏的密码哈希，AuthService 使用 Argon2 验证密码并签发 JWT。没有数据库结构变更。

实现参考：[NestJS JWT 官方仓库](https://github.com/nestjs/jwt)、[JWT 签名选项](https://github.com/auth0/node-jsonwebtoken)、[OWASP 认证失败通用响应](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-and-error-messages)、[ValidationPipe](https://docs.nestjs.com/techniques/validation)、[TypeORM QueryBuilder](https://typeorm.io/docs/query-builder/select-query-builder/)。

### 本地登录验收

配置 `.env` 中的 `JWT_SECRET`（使用 `openssl rand -base64 48` 生成，至少 32 个 UTF-8 字节），完成迁移和开发账号 Seed，再运行 `npm run build`、`npm run lint`、`npm run start:dev`。Nest 应正常监听 `http://localhost:3000` 并注册 `POST /auth/login`。

另开终端，用本地 `DEV_SEED_PASSWORD` 测试正确密码，避免将真实密码写入命令：

```bash
node -r dotenv/config -e \
  'process.stdout.write(JSON.stringify({email: "employee1@example.test", password: process.env.DEV_SEED_PASSWORD}))' |
curl -i http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' --data-binary @-
```

预期 HTTP 200，响应仅含 `accessToken`、`tokenType: "Bearer"`、`expiresIn: 1800`。不要把实际 Token 复制到文档或提交记录。

继续测试错误密码、不存在的用户和邮箱格式错误：

```bash
curl -i http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"employee1@example.test","password":"wrong-password"}'
curl -i http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"unknown@example.test","password":"wrong-password"}'
curl -i http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"invalid-email","password":"password123"}'
```

预期依次为 401、401、400。两个 401 的完整响应应相同；400 的 `code` 为 `VALIDATION_FAILED`。启动报密钥错误时检查 `.env`；缺少 `users` 表或 `password_hash` 列时检查连接目标及迁移记录；正确密码返回 401 时检查 Seed 密码、`is_active` 和登录查询的 `addSelect`。

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

先按 README 初始化激活的开发账号并登录。以下 Token 占位符须替换为对应账号的登录响应，创建成功后从响应复制工单 ID：

```bash
export BASE_URL='http://localhost:3000'
export TOKEN_A='<创建人 accessToken>'
export TOKEN_B='<审批人 accessToken>'
curl -i "$BASE_URL/requests" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN_A" -d '{"title":"采购申请"}'
export REQUEST_ID='<创建响应中的工单 UUID>'
curl -i "$BASE_URL/requests" -H "Authorization: Bearer $TOKEN_A"
curl -i "$BASE_URL/requests/$REQUEST_ID" -H "Authorization: Bearer $TOKEN_A"
curl -i -X POST "$BASE_URL/requests/$REQUEST_ID/submit" \
  -H "Authorization: Bearer $TOKEN_A"
curl -i -X POST "$BASE_URL/requests/$REQUEST_ID/approve" \
  -H "Authorization: Bearer $TOKEN_B"
curl -i "$BASE_URL/requests/$REQUEST_ID/events" -H "Authorization: Bearer $TOKEN_A"
```

驳回使用另一张已提交为 PENDING 的工单（不能再驳回上面已通过的工单）：

```bash
export REQUEST_ID='<另一张 PENDING 工单 UUID>'
curl -i "$BASE_URL/requests/$REQUEST_ID/reject" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN_B" \
  -d '{"reason":"采购预算不足，需要调整"}'
curl -i "$BASE_URL/requests/$REQUEST_ID/events" -H "Authorization: Bearer $TOKEN_A"
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
| 400  | VALIDATION_FAILED         | DTO 校验失败、未知请求体字段；多个信息合并到 message      |
| 400  | BAD_REQUEST               | 其他 BadRequestException，例如 Service 的 reason 防御校验 |
| 401  | UNAUTHORIZED              | 工单 Token 缺失、无效、过期、验证约束不符，或用户不存在、未激活 |
| 401  | INVALID_CREDENTIALS       | 登录邮箱或密码错误、账号未激活或没有有效密码哈希           |
| 404  | REQUEST_NOT_FOUND         | 工单不存在                                                |
| 404  | USER_NOT_FOUND            | 认证后事务内再次查询时操作人已不存在（并发删除）                              |
| 404  | RESOURCE_NOT_FOUND        | 路由不存在等其他404                                       |
| 409  | INVALID_STATUS_TRANSITION | 非法状态、重复操作或并发竞争失败                          |
| 500  | INTERNAL_SERVER_ERROR     | 数据库错误等未预期异常；message 固定为“服务器内部错误”    |

Filter 的其他默认码为 CONFLICT（409）、HTTP_ERROR（其他状态）；显式业务 code 优先。500 内部详情只记录在服务器日志，不返回 SQL、约束名或堆栈。认证在参数管道之前执行；数据库连接失败等系统异常保持 500，不转换为 401。参数错误的优先级依照 Nest 参数管道执行顺序，不承诺同时存在多个错误时返回哪一项。
