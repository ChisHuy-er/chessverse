import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PresenceService } from './presence.service';

@Controller('presence')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  // Trình duyệt báo "tôi đang online"
  @Post('ping')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  ping(@Req() req: { user: { sub: string } }) {
    this.presence.touch(req.user.sub);

    return { ok: true };
  }
}
