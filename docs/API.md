
## REST API

| HTTP 方法 | API                     | 作用              |
| ------- | ----------------------- | --------------- |
| POST    | `/requests`             | 创建工单，初始状态 DRAFT |
| GET     | `/requests`             | 查询工单列表          |
| GET     | `/requests/:id`         | 查询工单详情          |
| POST    | `/requests/:id/submit`  | 提交审批            |
| POST    | `/requests/:id/approve` | 审批通过            |
| POST    | `/requests/:id/reject`  | 审批驳回            |
| GET     | `/requests/:id/events`  | 查看操作历史          |


## 状态码


|HTTP 状态码|本项目中的用途|
|---|---|
|200|查询成功、操作成功|
|201|工单创建成功|
|400|参数不符合要求|
|404|工单不存在|
|409|当前状态不允许操作|
|500|未预期的服务器异常|