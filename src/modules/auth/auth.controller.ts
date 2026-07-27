import {
  Body,
  Controller,
  Post,
  Version,
} from '@nestjs/common';

import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  @Version('1')
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return {
      message: 'Validation successful',
      data: dto,
    };
  }
}