import * as argon2 from 'argon2';
import { QueryFailedError } from 'typeorm';
import dataSource from '../src/database/data-source';
import { main } from './seed-dev-users';

jest.mock('argon2', () => ({ argon2id: 2, hash: jest.fn() }));
jest.mock('../src/database/data-source', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    query: jest.fn(),
    transaction: jest.fn(),
    destroy: jest.fn(),
  },
}));

describe('Development user seed', () => {
  const originalEnv = process.env;
  const db = dataSource as unknown as {
    initialize: jest.Mock;
    query: jest.Mock;
    transaction: jest.Mock;
    destroy: jest.Mock;
  };
  const hash = jest.mocked(argon2.hash);
  let log: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      DB_HOST: '127.0.0.1',
      DB_NAME: 'workflow',
      NODE_ENV: 'development',
      DEV_SEED_PASSWORD: 'test-only-password',
    };
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    db.query.mockResolvedValue([{ name: 'workflow' }]);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it.each([
    { DB_NAME: 'workflow_test' },
    { DB_NAME: 'production' },
    { DB_HOST: 'db.example.test' },
    { NODE_ENV: 'production' },
  ])('连接数据库前拒绝不安全的运行配置 %j', async (override) => {
    Object.assign(process.env, override);

    await expect(main()).rejects.toThrow(
      'Seed 只能连接本地 workflow 开发数据库',
    );
    expect(db.initialize).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'short'])(
    '连接数据库前拒绝缺失或过短密码',
    async (password) => {
      if (password === undefined) {
        delete process.env.DEV_SEED_PASSWORD;
      } else {
        process.env.DEV_SEED_PASSWORD = password;
      }

      await expect(main()).rejects.toThrow(
        'DEV_SEED_PASSWORD 至少需要 12 个字符',
      );
      expect(db.initialize).not.toHaveBeenCalled();
    },
  );

  it.each([{ rows: [{ name: 'workflow_test' }] }, { rows: [] }])(
    '实际数据库不符合要求时终止并关闭连接',
    async ({ rows }) => {
      db.query.mockResolvedValue(rows);

      await expect(main()).rejects.toThrow('实际连接的数据库不是 workflow');
      expect(db.transaction).not.toHaveBeenCalled();
      expect(db.destroy).toHaveBeenCalledTimes(1);
    },
  );

  it('数据库查询失败时关闭连接', async () => {
    db.query.mockRejectedValue(new Error('Connection lost'));

    await expect(main()).rejects.toThrow('Connection lost');
    expect(db.destroy).toHaveBeenCalledTimes(1);
  });

  it('事务失败时不打印准备成功并关闭连接', async () => {
    db.transaction.mockRejectedValue(
      new QueryFailedError('INSERT', [], new Error('Conflict')),
    );

    await expect(main()).rejects.toThrow('Conflict');
    expect(log).not.toHaveBeenCalled();
    expect(db.destroy).toHaveBeenCalledTimes(1);
  });
});
