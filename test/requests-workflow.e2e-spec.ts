// test/requests-workflow.e2e-spec.ts

import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
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
  });

  afterAll(async () => {
    if (app) {
      try {
        // 仅清理本次运行创建的数据，不清空表或删除已有测试数据。
        if (actorId) {
          await db.transaction(async (manager) => {
            await manager.delete(RequestEventEntity, { actorId });
            await manager.delete(RequestEntity, { createdById: actorId });
            await manager.delete(UserEntity, { id: actorId });
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
});
