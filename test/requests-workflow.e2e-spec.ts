// test/requests-workflow.e2e-spec.ts

import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, In } from 'typeorm';
import { isUUID } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { UserEntity } from '../src/users/entities/user.entity';
import { RequestEntity } from '../src/requests/entities/request.entity';
import { RequestEventEntity } from '../src/request-events/entities/request-event.entity';

describe('Requests Workflow (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let actorId: string;
  let reviewerId: string;

  beforeAll(async () => {
    // 防止误操作开发数据库
    if (process.env.DB_NAME !== 'workflow_test') {
      throw new Error('必须使用 workflow_test 数据库');
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<INestApplication<App>>();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    db = app.get(DataSource);

    const [row] = await db.query<{ name: string }[]>(
      'SELECT current_database() AS name',
    );

    if (row.name !== 'workflow_test') {
      throw new Error('数据库连接目标错误');
    }

    const users = db.getRepository(UserEntity);
    const actor = await users.save(
      users.create({ displayName: 'Workflow e2e actor' }),
    );
    actorId = actor.id;
    const reviewer = await users.save(
      users.create({ displayName: 'Workflow e2e reviewer' }),
    );
    reviewerId = reviewer.id;
  });

  afterAll(async () => {
    if (app) {
      try {
        // 仅清理本次运行创建的数据，不清空表或删除已有测试数据。
        if (actorId) {
          const actorIds = reviewerId ? [actorId, reviewerId] : [actorId];
          await db.transaction(async (manager) => {
            await manager.delete(RequestEventEntity, { actorId: In(actorIds) });
            await manager.delete(RequestEntity, { createdById: In(actorIds) });
            await manager.delete(UserEntity, { id: In(actorIds) });
          });
        }
      } finally {
        await app.close();
      }
    }
  });

  async function createDraft(): Promise<RequestEntity> {
    const response = await request(app.getHttpServer())
      .post('/requests')
      .set('X-Demo-User-Id', actorId)
      .send({ title: 'Workflow e2e request', description: 'Test description' })
      .expect(201);

    const draft = response.body as RequestEntity;
    expect(draft).toMatchObject({
      title: 'Workflow e2e request',
      description: 'Test description',
      status: 'DRAFT',
      createdById: actorId,
    });
    return draft;
  }

  async function transition(
    id: string,
    action: 'submit' | 'approve' | 'reject',
  ): Promise<RequestEntity> {
    const response = await request(app.getHttpServer())
      .post(`/requests/${id}/${action}`)
      .set('X-Demo-User-Id', actorId)
      .send(action === 'reject' ? { reason: '  Needs revision  ' } : {})
      .expect(200);
    return response.body as RequestEntity;
  }

  async function expectPersistedWorkflow(
    id: string,
    status: string,
    actions: string[],
  ) {
    const saved = await request(app.getHttpServer())
      .get(`/requests/${id}`)
      .expect(200);
    expect(saved.body).toMatchObject({ id, status, createdById: actorId });

    const response = await request(app.getHttpServer())
      .get(`/requests/${id}/events`)
      .expect(200);
    const events = response.body as RequestEventEntity[];
    expect(events).toHaveLength(actions.length);
    expect(events.map((event) => event.action)).toEqual(actions);
    const transitions: Record<string, [string | null, string]> = {
      CREATED: [null, 'DRAFT'],
      SUBMITTED: ['DRAFT', 'PENDING'],
      APPROVED: ['PENDING', 'APPROVED'],
      REJECTED: ['PENDING', 'REJECTED'],
    };
    events.forEach((event, index) => {
      const action = actions[index];
      const [fromStatus, toStatus] = transitions[action];
      expect(event).toMatchObject({
        requestId: id,
        actorId,
        action,
        fromStatus,
        toStatus,
        note: action === 'REJECTED' ? 'Needs revision' : null,
      });
    });
  }

  async function verifyNoSideEffects(
    id: string,
    action: string,
    expectedStatus: string,
  ) {
    const before = await request(app.getHttpServer())
      .get(`/requests/${id}`)
      .expect(200);
    expect(before.body).toMatchObject({ status: expectedStatus });
    const eventsBefore = await request(app.getHttpServer())
      .get(`/requests/${id}/events`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/requests/${id}/${action}`)
      .set('X-Demo-User-Id', actorId)
      .send(action === 'reject' ? { reason: 'Invalid transition' } : {})
      .expect(409);
    expect(response.body).toMatchObject({
      statusCode: 409,
      code: 'INVALID_STATUS_TRANSITION',
    });

    const after = await request(app.getHttpServer())
      .get(`/requests/${id}`)
      .expect(200);
    const eventsAfter = await request(app.getHttpServer())
      .get(`/requests/${id}/events`)
      .expect(200);
    expect(after.body).toEqual(before.body);
    expect(eventsAfter.body).toEqual(eventsBefore.body);
  }

  it('creates a DRAFT request with a CREATED event', async () => {
    const draft = await createDraft();
    await expectPersistedWorkflow(draft.id, 'DRAFT', ['CREATED']);
  });

  it('lists a newly created request with the same data as its detail and database row', async () => {
    const draft = await createDraft();
    const listing = await request(app.getHttpServer())
      .get('/requests')
      .expect(200);
    expect(Array.isArray(listing.body)).toBe(true);
    const matches = (listing.body as RequestEntity[]).filter(
      (item) => item.id === draft.id,
    );
    expect(matches).toEqual([draft]);

    const detail = await request(app.getHttpServer())
      .get(`/requests/${draft.id}`)
      .expect(200);
    const saved = await db
      .getRepository(RequestEntity)
      .findOneByOrFail({ id: draft.id });
    expect(detail.body).toEqual(draft);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(detail.body);
  });

  describe('完整业务流程', () => {
    async function expectCompletedWorkflow(
      id: string,
      status: 'APPROVED' | 'REJECTED',
      note: string | null = null,
    ) {
      const finalRequest = await request(app.getHttpServer())
        .get(`/requests/${id}`)
        .expect(200);
      expect(finalRequest.body).toMatchObject({
        id,
        status,
        createdById: actorId,
      });
      const history = await request(app.getHttpServer())
        .get(`/requests/${id}/events`)
        .expect(200);
      const events = history.body as RequestEventEntity[];
      expect(events).toHaveLength(3);
      expect(events.map((event) => event.action)).toEqual([
        'CREATED',
        'SUBMITTED',
        status,
      ]);
      expect(events.map((event) => event.actorId)).toEqual([
        actorId,
        actorId,
        reviewerId,
      ]);
      const expectedEvents = [
        { fromStatus: null, toStatus: 'DRAFT', note: null },
        { fromStatus: 'DRAFT', toStatus: 'PENDING', note: null },
        { fromStatus: 'PENDING', toStatus: status, note },
      ];
      events.forEach((event, index) => {
        expect(event).toMatchObject({
          requestId: id,
          ...expectedEvents[index],
        });
      });

      const saved = await db
        .getRepository(RequestEntity)
        .findOneByOrFail({ id });
      const savedEvents = await db.getRepository(RequestEventEntity).find({
        where: { requestId: id },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      expect(JSON.parse(JSON.stringify(saved))).toEqual(finalRequest.body);
      expect(JSON.parse(JSON.stringify(savedEvents))).toEqual(events);
    }

    it('创建 → 查询 → 提交 → 通过 → 历史', async () => {
      const draft = await createDraft();
      const detail = await request(app.getHttpServer())
        .get(`/requests/${draft.id}`)
        .expect(200);
      expect(detail.body).toEqual(draft);

      expect(await transition(draft.id, 'submit')).toMatchObject({
        id: draft.id,
        status: 'PENDING',
        createdById: actorId,
      });
      const approved = await request(app.getHttpServer())
        .post(`/requests/${draft.id}/approve`)
        .set('X-Demo-User-Id', reviewerId)
        .send({})
        .expect(200);
      expect(approved.body).toMatchObject({ id: draft.id, status: 'APPROVED' });

      await expectCompletedWorkflow(draft.id, 'APPROVED');
    });

    it('创建 → 提交 → 驳回 → 历史', async () => {
      const draft = await createDraft();
      expect(await transition(draft.id, 'submit')).toMatchObject({
        id: draft.id,
        status: 'PENDING',
        createdById: actorId,
      });
      const reason = '采购预算不足，需要调整';
      const rejected = await request(app.getHttpServer())
        .post(`/requests/${draft.id}/reject`)
        .set('X-Demo-User-Id', reviewerId)
        .send({ reason })
        .expect(200);
      expect(rejected.body).toMatchObject({ id: draft.id, status: 'REJECTED' });

      await expectCompletedWorkflow(draft.id, 'REJECTED', reason);
    });
  });

  it('submits DRAFT to PENDING with a SUBMITTED event', async () => {
    const draft = await createDraft();
    expect(await transition(draft.id, 'submit')).toMatchObject({
      id: draft.id,
      status: 'PENDING',
    });
    await expectPersistedWorkflow(draft.id, 'PENDING', [
      'CREATED',
      'SUBMITTED',
    ]);
  });

  it.each([
    ['approve', 'APPROVED'],
    ['reject', 'REJECTED'],
  ] as const)(
    'changes PENDING via %s with its event',
    async (action, status) => {
      const draft = await createDraft();
      await transition(draft.id, 'submit');
      expect(await transition(draft.id, action)).toMatchObject({
        id: draft.id,
        status,
      });
      await expectPersistedWorkflow(draft.id, status, [
        'CREATED',
        'SUBMITTED',
        status,
      ]);
    },
  );

  it.each([
    ['DRAFT', 'approve'],
    ['DRAFT', 'reject'],
    ['PENDING', 'submit'],
    ['APPROVED', 'submit'],
    ['APPROVED', 'approve'],
    ['APPROVED', 'reject'],
    ['REJECTED', 'submit'],
    ['REJECTED', 'approve'],
    ['REJECTED', 'reject'],
  ] as const)(
    '%s cannot %s and leaves the request and events unchanged',
    async (status, action) => {
      const draft = await createDraft();
      if (status !== 'DRAFT') {
        await transition(draft.id, 'submit');
      }
      if (status === 'APPROVED' || status === 'REJECTED') {
        await transition(
          draft.id,
          status === 'APPROVED' ? 'approve' : 'reject',
        );
      }
      await verifyNoSideEffects(draft.id, action, status);
    },
  );

  // 每轮使用新工单；Promise.all 发起真实 HTTP 竞争，不预设哪一方获胜。
  it.each(Array.from({ length: 20 }, (_, index) => index + 1))(
    'concurrent approval and rejection produce one decision (round %i)',
    async () => {
      const draft = await createDraft();
      await transition(draft.id, 'submit');
      const before = await db.getRepository(RequestEventEntity).find({
        where: { requestId: draft.id },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      expect(before.map((event) => event.action)).toEqual([
        'CREATED',
        'SUBMITTED',
      ]);
      expect(reviewerId).not.toBe(actorId);

      const reason = '预算不足';
      const [approveResult, rejectResult] = await Promise.all([
        request(app.getHttpServer())
          .post(`/requests/${draft.id}/approve`)
          .set('X-Demo-User-Id', actorId)
          .send({}),
        request(app.getHttpServer())
          .post(`/requests/${draft.id}/reject`)
          .set('X-Demo-User-Id', reviewerId)
          .send({ reason }),
      ]);
      expect(
        [approveResult.status, rejectResult.status].sort((a, b) => a - b),
      ).toEqual([200, 409]);

      const approved = approveResult.status === 200;
      const winner = approved ? approveResult : rejectResult;
      const loser = approved ? rejectResult : approveResult;
      const status = approved ? 'APPROVED' : 'REJECTED';
      expect(loser.body).toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
      expect(winner.body).toMatchObject({ id: draft.id, status });

      const finalRequest = await request(app.getHttpServer())
        .get(`/requests/${draft.id}`)
        .expect(200);
      expect(finalRequest.body).toMatchObject({ id: draft.id, status });
      const history = await request(app.getHttpServer())
        .get(`/requests/${draft.id}/events`)
        .expect(200);
      const events = history.body as RequestEventEntity[];
      expect(events).toHaveLength(3);
      expect(events.map((event) => event.action)).toEqual([
        'CREATED',
        'SUBMITTED',
        status,
      ]);
      const decisions = events.filter((event) =>
        ['APPROVED', 'REJECTED'].includes(event.action),
      );
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toMatchObject({
        requestId: draft.id,
        actorId: approved ? actorId : reviewerId,
        action: status,
        fromStatus: 'PENDING',
        toStatus: status,
        note: approved ? null : reason,
      });

      // 独立查询数据库，核对 HTTP 返回值并确认原有事件没有被改写。
      const saved = await db
        .getRepository(RequestEntity)
        .findOneByOrFail({ id: draft.id });
      const savedEvents = await db.getRepository(RequestEventEntity).find({
        where: { requestId: draft.id },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      expect(saved.status).toBe(status);
      expect(savedEvents.slice(0, 2)).toEqual(before);
      expect(JSON.parse(JSON.stringify(savedEvents))).toEqual(events);
    },
  );

  it.each(Array.from({ length: 20 }, (_, index) => index + 1))(
    'concurrent submissions produce one SUBMITTED event (round %i)',
    async () => {
      const draft = await createDraft();
      const results = await Promise.all(
        [actorId, reviewerId].map((submitterId) =>
          request(app.getHttpServer())
            .post(`/requests/${draft.id}/submit`)
            .set('X-Demo-User-Id', submitterId)
            .send({}),
        ),
      );
      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([200, 409]);
      const winnerIndex = results.findIndex((result) => result.status === 200);
      expect(results[winnerIndex].body).toMatchObject({
        id: draft.id,
        status: 'PENDING',
      });
      expect(results[1 - winnerIndex].body).toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });

      const saved = await db
        .getRepository(RequestEntity)
        .findOneByOrFail({ id: draft.id });
      const events = await db.getRepository(RequestEventEntity).find({
        where: { requestId: draft.id },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      expect(saved.status).toBe('PENDING');
      expect(events).toHaveLength(2);
      expect(events.map((event) => event.action)).toEqual([
        'CREATED',
        'SUBMITTED',
      ]);
      expect(events[1]).toMatchObject({
        requestId: draft.id,
        actorId: [actorId, reviewerId][winnerIndex],
        fromStatus: 'DRAFT',
        toStatus: 'PENDING',
        note: null,
      });
    },
  );

  it('rolls back approval when PostgreSQL rejects the APPROVED event', async () => {
    const draft = await createDraft();
    await transition(draft.id, 'submit');
    await expectPersistedWorkflow(draft.id, 'PENDING', [
      'CREATED',
      'SUBMITTED',
    ]);

    // DDL 无法参数化此 UUID 字面量，拼接前先验证其格式。
    expect(isUUID(draft.id)).toBe(true);
    const constraintName = `day6_fail_approved_event_${draft.id.replaceAll('-', '')}`;
    const requestSql = 'SELECT * FROM requests WHERE id = $1';
    const eventsSql = `
      SELECT * FROM request_events
      WHERE request_id = $1
      ORDER BY created_at ASC, id ASC
    `;
    const requestsBefore = await db.query<Record<string, unknown>[]>(
      requestSql,
      [draft.id],
    );
    const eventsBefore = await db.query<Record<string, unknown>[]>(eventsSql, [
      draft.id,
    ]);
    expect(requestsBefore).toHaveLength(1);
    expect(requestsBefore[0]).toMatchObject({ status: 'PENDING' });
    expect(eventsBefore).toHaveLength(2);
    expect(eventsBefore.map((event) => event.action)).toEqual([
      'CREATED',
      'SUBMITTED',
    ]);

    try {
      // 只拒绝本次工单的 APPROVED 事件，保留真实的事务和数据库写入。
      await db.query(`
        ALTER TABLE request_events
        ADD CONSTRAINT "${constraintName}"
        CHECK (NOT (request_id = '${draft.id}'::uuid AND action = 'APPROVED'))
      `);

      await request(app.getHttpServer())
        .post(`/requests/${draft.id}/approve`)
        .set('X-Demo-User-Id', actorId)
        .send({})
        .expect(500)
        .expect({
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: '服务器内部错误',
          path: `/requests/${draft.id}/approve`,
        });

      // 从独立数据库查询确认事务已回滚，连更新时间和事件 ID 也保持不变。
      const requestsAfter = await db.query<Record<string, unknown>[]>(
        requestSql,
        [draft.id],
      );
      const eventsAfter = await db.query<Record<string, unknown>[]>(eventsSql, [
        draft.id,
      ]);
      expect(requestsAfter).toEqual(requestsBefore);
      expect(eventsAfter).toEqual(eventsBefore);
    } finally {
      await db.query(`
        ALTER TABLE request_events
        DROP CONSTRAINT IF EXISTS "${constraintName}"
      `);
      const constraints = await db.query<{ conname: string }[]>(
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'request_events'::regclass AND conname = $1`,
        [constraintName],
      );
      expect(constraints).toEqual([]);
    }

    // 移除故障后，同一张工单可以正常审批，且只新增一个事件。
    await transition(draft.id, 'approve');
    await expectPersistedWorkflow(draft.id, 'APPROVED', [
      'CREATED',
      'SUBMITTED',
      'APPROVED',
    ]);
  });
});
