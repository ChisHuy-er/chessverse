
import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  // Hồ sơ cá nhân
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMyProfile(
    @Req() req: { user: { sub: string } },
  ) {
    return this.usersService.getMyProfile(
      req.user.sub,
    );
  }

  // Bảng xếp hạng
  @Get('leaderboard')
  getLeaderboard() {
    return this.usersService.getLeaderboard();
  }

  // Hồ sơ người chơi theo username
  @Get(':username')
  getPlayerProfile(
    @Param('username') username: string,
  ) {
    return this.usersService.getPlayerProfile(
      username,
    );
  }
}
