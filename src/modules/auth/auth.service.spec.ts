import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  const usersService = { findByEmail: jest.fn() };
  const jwtService = { signAsync: jest.fn() };
  const service = new AuthService(
    usersService as unknown as UsersService,
    jwtService as unknown as JwtService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects login for an unknown email', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    await expect(service.login('unknown@example.com', 'password'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
