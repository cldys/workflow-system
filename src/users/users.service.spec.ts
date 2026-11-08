import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UserEntity } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('looks up a user by ID and propagates database failures', async () => {
    const user = { id: '550e8400-e29b-41d4-a716-446655440001' };
    const error = new Error('database unavailable');
    const repository = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(error),
    };
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: repository },
      ],
    }).compile();
    const service = module.get(UsersService);

    expect(await service.findById(user.id)).toBe(user);
    expect(repository.findOneBy).toHaveBeenCalledWith({ id: user.id });
    expect(await service.findById(user.id)).toBeNull();
    await expect(service.findById(user.id)).rejects.toBe(error);
    await module.close();
  });

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
