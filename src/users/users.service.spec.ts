import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UserEntity } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('normalizes email and explicitly selects the hidden password hash', async () => {
    const user = { id: 'user-id', passwordHash: 'hash' };
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValueOnce(user).mockResolvedValueOnce(null),
    };
    const repository = { createQueryBuilder: jest.fn(() => query) };
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: repository },
      ],
    }).compile();
    const service = module.get(UsersService);

    expect(await service.findByEmailForLogin(' Employee@Example.test ')).toBe(
      user,
    );
    expect(repository.createQueryBuilder).toHaveBeenCalledWith('user');
    expect(query.addSelect).toHaveBeenCalledWith('user.passwordHash');
    expect(query.where).toHaveBeenCalledWith('LOWER(user.email) = :email', {
      email: 'employee@example.test',
    });
    expect(
      await service.findByEmailForLogin('missing@example.test'),
    ).toBeNull();

    await module.close();
  });
});
