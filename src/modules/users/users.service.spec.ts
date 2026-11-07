import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('UsersService', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const service = new UsersService(prisma as unknown as PrismaService);

  it('rejects following yourself', async () => {
    await expect(service.follow('user-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('looks up users by email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    await expect(service.findByEmail('student@example.com')).resolves.toEqual({ id: 'user-1' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'student@example.com' } });
  });
});
