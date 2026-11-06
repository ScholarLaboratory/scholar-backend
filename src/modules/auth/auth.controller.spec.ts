import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  it('passes credentials to the authentication service', async () => {
    const authService = { login: jest.fn().mockResolvedValue({ success: true }) };
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    const controller = module.get(AuthController);
    await expect(controller.login({ email: 'test@example.com', password: 'password123' }))
      .resolves.toEqual({ success: true });
    expect(authService.login).toHaveBeenCalledWith('test@example.com', 'password123');
  });
});
