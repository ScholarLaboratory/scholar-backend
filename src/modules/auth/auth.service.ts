import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
 constructor(
  private readonly usersService: UsersService,
  private readonly jwtService: JwtService,
) {}

  async register(dto: RegisterDto) {
    const { fullName, username, email, password } = dto;

    // Check if email already exists
    const existingEmail = await this.usersService.findByEmail(email);

    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    // Check if username already exists
    const existingUsername = await this.usersService.findByUsername(username);

    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.usersService.create({
      fullName,
      username,
      email,
      password: hashedPassword,
    });

    // Remove password before sending response
    const { password: _, ...safeUser } = user;

    return {
      success: true,
      message: 'Registration successful',
      data: safeUser,
    };
  }

  async login(email: string, password: string) {
  const user = await this.usersService.findByEmail(email);

  if (!user) {
    throw new UnauthorizedException('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.password,
  );

  if (!passwordMatches) {
    throw new UnauthorizedException('Invalid email or password');
  }

  const payload = {
    sub: user.id,
    email: user.email,
    username: user.username,
  };

  const accessToken = await this.jwtService.signAsync(payload);

  return {
    success: true,
    message: 'Login successful',
    data: {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
      },
    },
  };
}
}