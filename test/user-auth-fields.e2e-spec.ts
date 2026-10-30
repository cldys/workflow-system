import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { QueryRunner, Repository } from 'typeorm';
import db from '../src/database/data-source';
import { UserEntity } from '../src/users/entities/user.entity';

describe('User auth fields (e2e)', () => {
  let runner: QueryRunner;
  let users: Repository<UserEntity>;

  beforeAll(async () => {
    if (process.env.DB_NAME !== 'workflow_test') {
      throw new Error('必须使用 workflow_test 数据库');
    }

    await db.initialize();
    const [row] = await db.query<{ name: string }[]>(
      'SELECT current_database() AS name',
    );
    if (row.name !== 'workflow_test') {
      throw new Error('数据库连接目标错误');
    }
  });

  beforeEach(async () => {
    runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    users = runner.manager.getRepository(UserEntity);
  });

  afterEach(async () => {
    if (runner) {
      try {
        if (runner.isTransactionActive) {
          await runner.rollbackTransaction();
        }
      } finally {
        await runner.release();
      }
    }
  });

  afterAll(async () => {
    if (db.isInitialized) {
      await db.destroy();
    }
  });

  it('保留仅有姓名的用户写入方式，并允许多个空邮箱', async () => {
    const saved = await users.save([
      users.create({ displayName: 'Auth fields e2e first' }),
      users.create({ displayName: 'Auth fields e2e second' }),
    ]);

    for (const user of saved) {
      const found = await users.findOneByOrFail({ id: user.id });
      expect(found).toMatchObject({
        email: null,
        role: 'EMPLOYEE',
        isActive: false,
      });
      expect(found.passwordHash).toBeUndefined();
    }
  });

  it('普通查询不读取密码哈希，显式查询可以读取', async () => {
    const saved = await users.save(
      users.create({
        displayName: 'Auth fields e2e approver',
        email: `${randomUUID()}@example.test`,
        passwordHash: 'test-only-hash',
        role: 'APPROVER',
        isActive: true,
      }),
    );

    const found = await users.findOneByOrFail({ id: saved.id });
    expect(found).toMatchObject({ role: 'APPROVER', isActive: true });
    expect(found.passwordHash).toBeUndefined();

    const withPassword = await users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: saved.id })
      .getOneOrFail();
    expect(withPassword.passwordHash).toBe('test-only-hash');
  });

  it('拒绝大小写不同的重复邮箱', async () => {
    const email = `Employee-${randomUUID()}@example.test`;
    await users.insert({ displayName: 'Auth fields e2e email', email });

    await expect(
      users.insert({
        displayName: 'Auth fields e2e duplicate',
        email: email.toLowerCase(),
      }),
    ).rejects.toMatchObject({
      driverError: { code: '23505', constraint: 'IDX_users_email_unique_ci' },
    });
  });

  it('数据库拒绝非法角色', async () => {
    await expect(
      runner.query('INSERT INTO users (display_name, role) VALUES ($1, $2)', [
        'Auth fields e2e invalid role',
        'ADMIN',
      ]),
    ).rejects.toMatchObject({
      driverError: { code: '23514', constraint: 'CHK_users_role' },
    });
  });
});
