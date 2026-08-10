import {
  Controller,
  Get,
  Req,
  UseGuards,
  Body,
  Patch,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get current user profile',
  })
  async getMe(@Req() req: any) {
    const user = await this.usersService.findById(req.user.id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...safeUser } = user;

    return {
      success: true,
      message: 'Profile retrieved successfully',
      data: safeUser,
    };
  }

  @Patch('me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@ApiOperation({
  summary: 'Update current student profile',
})
async updateProfile(
  @Req() req: any,
  @Body() dto: UpdateProfileDto,
) {
  const user = await this.usersService.updateProfile(
    req.user.id,
    dto,
  );

  const { password, ...safeUser } = user;

  return {
    success: true,
    message: 'Profile updated successfully',
    data: safeUser,
  };
}
}