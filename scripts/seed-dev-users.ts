import 'dotenv/config';
import * as argon2 from 'argon2';
import { Raw } from 'typeorm';

import dataSource from '../src/database/data-source';
import { UserEntity, type UserRole } from '../src/users/entities/user.entity';

type SeedUser = {
  email: string;
  displayName: string;
  role: UserRole;
};

const seedUsers: SeedUser[] = [
  {
    email: 'employee1@example.test',
    displayName: '员工 A',
    role: 'EMPLOYEE',
  },
  {
    email: 'employee2@example.test',
    displayName: '员工 B',
    role: 'EMPLOYEE',
  },
  {
    email: 'approver1@example.test',
    displayName: '审批人 C',
    role: 'APPROVER',
  },
  {
    email: 'approver2@example.test',
    displayName: '审批人 D',
    role: 'APPROVER',
  },
];

export async function main(): Promise<void> {
  if (
    process.env.DB_NAME !== 'workflow' ||
    !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST ?? '') ||
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error('Seed 只能连接本地 workflow 开发数据库');
  }

  const password = process.env.DEV_SEED_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('DEV_SEED_PASSWORD 至少需要 12 个字符');
  }

  await dataSource.initialize();

  try {
    const rows: { name: string }[] = await dataSource.query(
      'SELECT current_database() AS name',
    );
    if (rows[0]?.name !== 'workflow') {
      throw new Error('实际连接的数据库不是 workflow');
    }

    // 四个账号一起提交，任何一个失败都不会留下部分更新。
    await dataSource.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity);

      for (const item of seedUsers) {
        const email = item.email.trim().toLowerCase();
        const passwordHash = await argon2.hash(password, {
          type: argon2.argon2id,
        });

        // 与邮箱唯一索引使用相同的大小写规则，保留已有账号的 UUID。
        const existing = await users.findOneBy({
          email: Raw((alias) => `LOWER(${alias}) = :email`, { email }),
        });
        const values = {
          displayName: item.displayName,
          email,
          passwordHash,
          role: item.role,
          isActive: true,
        };

        if (existing) {
          await users.update(existing.id, values);
        } else {
          await users.save(users.create(values));
        }
      }
    });

    for (const item of seedUsers) {
      console.log(`已准备测试账号：${item.email} (${item.role})`);
    }
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error(`Seed 执行失败：${message}`);
    process.exitCode = 1;
  });
}
