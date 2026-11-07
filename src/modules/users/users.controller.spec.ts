import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  it('returns the profile without a password', async () => {
    const usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1', username: 'learner', password: 'secret',
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();
    const controller = module.get(UsersController);
    await expect(controller.getMe({ user: { id: 'user-1' } })).resolves.toEqual({
      success: true,
      message: 'Profile retrieved successfully',
      data: { id: 'user-1', username: 'learner' },
    });
  });
});
