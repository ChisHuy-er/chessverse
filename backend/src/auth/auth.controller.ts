import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  LoginRateLimitGuard,
  RegisterRateLimitGuard,
} from './rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(RegisterRateLimitGuard)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @UseGuards(LoginRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: { user: { sub: string } }) {
    return this.authService.getMe(req.user.sub);
  }

  @Post('socket-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  createSocketToken(@Req() req: { user: { sub: string } }) {
    return this.authService.createOnlineSocketToken(req.user.sub);
  }
}