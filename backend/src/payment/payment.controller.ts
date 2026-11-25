import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentService } from './payment.service';

type AuthReq = Request & { user: { sub: string } };

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const ip = (first || req.socket.remoteAddress || '127.0.0.1').replace(/^::ffff:/, '');

  return ip.includes(':') ? '127.0.0.1' : ip;
}

@Controller('payment')
export class PaymentController {
  constructor(private readonly payment: PaymentService) {}

  // Danh sách gói + cổng đang bật (công khai)
  @Get('packages')
  packages() {
    return this.payment.info();
  }

  // ----- Cần đăng nhập -----

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  create(@Req() req: AuthReq, @Body() body: { packageId?: unknown; provider?: unknown }) {
    return this.payment.createOrder(
      req.user.sub,
      typeof body?.packageId === 'string' ? body.packageId : '',
      typeof body?.provider === 'string' ? body.provider : '',
      clientIp(req),
    );
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  history(@Req() req: AuthReq) {
    return this.payment.history(req.user.sub);
  }

  @Get('orders/:id')
  @UseGuards(JwtAuthGuard)
  order(@Req() req: AuthReq, @Param('id') id: string) {
    return this.payment.getOrder(req.user.sub, id);
  }

  @Post('orders/:id/mock-pay')
  @UseGuards(JwtAuthGuard)
  mockPay(@Req() req: AuthReq, @Param('id') id: string) {
    return this.payment.mockPay(req.user.sub, id);
  }

  // ----- Cổng thanh toán gọi về (không có token, xác thực bằng chữ ký) -----

  @Get('vnpay/ipn')
  vnpayIpn(@Query() query: Record<string, unknown>) {
    return this.payment.vnpayIpn(query);
  }

  @Get('vnpay/return')
  async vnpayReturn(@Query() query: Record<string, unknown>, @Res() res: Response) {
    res.redirect(await this.payment.vnpayReturn(query));
  }

  @Post('momo/ipn')
  @HttpCode(204)
  async momoIpn(@Body() body: Record<string, unknown>) {
    await this.payment.momoNotify(body ?? {});
  }

  @Get('momo/return')
  async momoReturn(@Query() query: Record<string, unknown>, @Res() res: Response) {
    res.redirect(await this.payment.momoReturn(query));
  }
}
