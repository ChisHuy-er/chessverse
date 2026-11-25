import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MomoConfig, VnpayConfig, momoCreate, momoVerify, vnpayBuildUrl, vnpayVerify } from './gateways';
import { TOPUP_PACKAGES, findPackage } from './payment.packages';

const EXPIRE_MINUTES = 15;

export type CreditOutcome = 'credited' | 'already' | 'not_found' | 'amount_mismatch' | 'failed';

@Injectable()
export class PaymentService {
  private readonly log = new Logger('Payment');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ---------- Cấu hình ----------

  get frontendUrl() {
    return (this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001').replace(/\/$/, '');
  }

  private get apiUrl() {
    return (this.config.get<string>('PUBLIC_API_URL') || `http://localhost:${this.config.get('PORT') || 3000}`).replace(/\/$/, '');
  }

  get vnpay(): VnpayConfig | null {
    const tmnCode = this.config.get<string>('VNP_TMN_CODE');
    const hashSecret = this.config.get<string>('VNP_HASH_SECRET');

    if (!tmnCode || !hashSecret) return null;

    return {
      tmnCode,
      hashSecret,
      payUrl: this.config.get<string>('VNP_URL') || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    };
  }

  get momo(): MomoConfig | null {
    const partnerCode = this.config.get<string>('MOMO_PARTNER_CODE');
    const accessKey = this.config.get<string>('MOMO_ACCESS_KEY');
    const secretKey = this.config.get<string>('MOMO_SECRET_KEY');

    if (!partnerCode || !accessKey || !secretKey) return null;

    return {
      partnerCode,
      accessKey,
      secretKey,
      endpoint: this.config.get<string>('MOMO_ENDPOINT') || 'https://test-payment.momo.vn/v2/gateway/api/create',
    };
  }

  // Thanh toán thử (không qua cổng) — tự tắt khi chạy production
  get mockEnabled() {
    return this.config.get('NODE_ENV') !== 'production' && this.config.get('PAYMENT_MOCK') !== 'false';
  }

  // Khóa nạp kim cương (đang phát triển): luôn khóa, kể cả thanh toán thử,
  // cho tới khi đặt PAYMENT_ENABLED=true trong .env
  get locked() {
    return this.config.get('PAYMENT_ENABLED') !== 'true';
  }

  info() {
    const locked = this.locked;

    return {
      packages: TOPUP_PACKAGES,
      providers: {
        vnpay: !locked && !!this.vnpay,
        momo: !locked && !!this.momo,
        mock: !locked && this.mockEnabled,
      },
      sandbox: this.config.get('NODE_ENV') !== 'production',
      locked,
    };
  }

  // ---------- Tạo đơn ----------

  async createOrder(userId: string, packageId: string, providerRaw: string, ipAddr: string) {
    if (this.locked) throw new ForbiddenException('Nạp kim cương đang tạm khóa trong giai đoạn thử nghiệm');

    const pkg = findPackage(packageId);

    if (!pkg) throw new BadRequestException('Gói nạp không tồn tại');

    const providers: Record<string, PaymentProvider | undefined> = { vnpay: 'VNPAY', momo: 'MOMO', mock: 'MOCK' };
    const provider = providers[providerRaw];

    if (!provider) throw new BadRequestException('Phương thức thanh toán không hợp lệ');
    if (provider === 'VNPAY' && !this.vnpay) throw new ServiceUnavailableException('VNPAY chưa được cấu hình');
    if (provider === 'MOMO' && !this.momo) throw new ServiceUnavailableException('MoMo chưa được cấu hình');
    if (provider === 'MOCK' && !this.mockEnabled) throw new ForbiddenException('Thanh toán thử đã tắt');

    // Chống spam tạo đơn
    const recent = await this.prisma.paymentOrder.count({
      where: { userId, status: 'PENDING', createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    });

    if (recent >= 5) throw new BadRequestException('Bạn đang có quá nhiều đơn chờ thanh toán, vui lòng thử lại sau ít phút');

    const order = await this.prisma.paymentOrder.create({
      data: { userId, packageId: pkg.id, amount: pkg.price, gems: pkg.gems + pkg.bonus, provider },
    });

    // Không dấu, không ký tự đặc biệt (yêu cầu của cổng)
    const info = `Nap ${order.gems} kim cuong ChessVerse ${order.id}`;

    try {
      if (provider === 'VNPAY') {
        const payUrl = vnpayBuildUrl(this.vnpay!, {
          orderId: order.id,
          amount: order.amount,
          info,
          returnUrl: `${this.apiUrl}/payment/vnpay/return`,
          ipAddr,
          createdAt: order.createdAt,
          expireMinutes: EXPIRE_MINUTES,
        });

        return { orderId: order.id, payUrl };
      }

      if (provider === 'MOMO') {
        const { payUrl } = await momoCreate(this.momo!, {
          orderId: order.id,
          amount: order.amount,
          info,
          redirectUrl: `${this.apiUrl}/payment/momo/return`,
          ipnUrl: `${this.apiUrl}/payment/momo/ipn`,
        });

        return { orderId: order.id, payUrl };
      }

      return { orderId: order.id, payUrl: null, mock: true };
    } catch (error) {
      await this.prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      this.log.error(`Tạo giao dịch ${provider} lỗi: ${(error as Error).message}`);

      throw new ServiceUnavailableException('Không tạo được giao dịch với cổng thanh toán, vui lòng thử lại');
    }
  }

  // ---------- Cộng kim cương (chỉ một lần cho mỗi đơn) ----------

  async credit(orderId: string, paidAmount: number, providerTxnId: string, providerData: Record<string, unknown>): Promise<CreditOutcome> {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id: orderId } });

    if (!order) return 'not_found';
    if (order.status === 'PAID') return 'already';
    if (order.amount !== paidAmount) return 'amount_mismatch';

    const done = await this.prisma.$transaction(async (tx) => {
      // Điều kiện status giúp 2 thông báo đến cùng lúc cũng chỉ cộng 1 lần
      const claimed = await tx.paymentOrder.updateMany({
        where: { id: orderId, status: { in: ['PENDING', 'EXPIRED'] } },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          providerTxnId: providerTxnId || null,
          providerData: providerData as Prisma.InputJsonValue,
        },
      });

      if (claimed.count !== 1) return false;

      const user = await tx.user.update({
        where: { id: order.userId },
        data: { gems: { increment: order.gems } },
        select: { gems: true },
      });

      await tx.gemTransaction.create({
        data: { userId: order.userId, delta: order.gems, balance: user.gems, reason: 'TOPUP', refId: order.id },
      });

      return true;
    });

    if (done) this.log.log(`Đơn ${orderId}: +${order.gems} kim cương cho ${order.userId}`);

    return done ? 'credited' : 'already';
  }

  async markFailed(orderId: string, providerData: Record<string, unknown>) {
    await this.prisma.paymentOrder.updateMany({
      where: { id: orderId, status: 'PENDING' },
      data: { status: 'FAILED', providerData: providerData as Prisma.InputJsonValue },
    });
  }

  // ---------- VNPAY ----------

  async vnpayIpn(query: Record<string, unknown>) {
    const cfg = this.vnpay;

    if (!cfg) return { RspCode: '99', Message: 'Not configured' };

    const r = vnpayVerify(cfg, query);

    if (!r.valid) return { RspCode: '97', Message: 'Invalid signature' };

    const order = await this.prisma.paymentOrder.findUnique({ where: { id: r.orderId } });

    if (!order || order.provider !== 'VNPAY') return { RspCode: '01', Message: 'Order not found' };
    if (order.amount !== r.amount) return { RspCode: '04', Message: 'Invalid amount' };
    if (order.status === 'PAID' || order.status === 'FAILED') return { RspCode: '02', Message: 'Order already confirmed' };

    if (r.success) {
      await this.credit(order.id, r.amount, r.txnNo, { ...query });
    } else {
      await this.markFailed(order.id, { ...query });
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  // Trang quay về: kiểm chữ ký rồi xử lý luôn (để chạy được trên máy không có IPN công khai)
  async vnpayReturn(query: Record<string, unknown>) {
    const cfg = this.vnpay;
    const r = cfg ? vnpayVerify(cfg, query) : null;

    if (r?.valid) {
      const order = await this.prisma.paymentOrder.findUnique({ where: { id: r.orderId } });

      if (order?.provider === 'VNPAY') {
        if (r.success) await this.credit(order.id, r.amount, r.txnNo, { ...query });
        else await this.markFailed(order.id, { ...query });
      }
    }

    return `${this.frontendUrl}/shop?topup=${encodeURIComponent(r?.orderId || '')}`;
  }

  // ---------- MOMO ----------

  async momoNotify(input: Record<string, unknown>) {
    const cfg = this.momo;

    if (!cfg) return null;

    const r = momoVerify(cfg, input);

    if (!r.valid) {
      this.log.warn(`MoMo: chữ ký không hợp lệ cho đơn ${r.orderId}`);
      return r;
    }

    const order = await this.prisma.paymentOrder.findUnique({ where: { id: r.orderId } });

    if (order?.provider === 'MOMO') {
      if (r.success) await this.credit(order.id, r.amount, r.transId, { ...input });
      else await this.markFailed(order.id, { ...input });
    }

    return r;
  }

  async momoReturn(query: Record<string, unknown>) {
    const r = await this.momoNotify(query);

    return `${this.frontendUrl}/shop?topup=${encodeURIComponent(r?.orderId || String(query.orderId ?? ''))}`;
  }

  // ---------- Thanh toán thử ----------

  async mockPay(userId: string, orderId: string) {
    if (!this.mockEnabled || this.locked) throw new ForbiddenException('Thanh toán thử đã tắt');

    const order = await this.prisma.paymentOrder.findUnique({ where: { id: orderId } });

    if (!order || order.userId !== userId) throw new NotFoundException('Không tìm thấy đơn');
    if (order.provider !== PaymentProvider.MOCK) throw new BadRequestException('Đơn này không phải đơn thanh toán thử');

    await this.credit(order.id, order.amount, `MOCK-${Date.now()}`, { mock: true });

    return this.getOrder(userId, orderId);
  }

  // ---------- Xem đơn ----------

  private view(o: { id: string; packageId: string; amount: number; gems: number; provider: PaymentProvider; status: string; createdAt: Date; paidAt: Date | null }) {
    const expired = o.status === 'PENDING' && Date.now() - o.createdAt.getTime() > EXPIRE_MINUTES * 60_000;

    return {
      id: o.id,
      packageId: o.packageId,
      amount: o.amount,
      gems: o.gems,
      provider: o.provider,
      status: expired ? 'EXPIRED' : o.status,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
    };
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id: orderId } });

    if (!order || order.userId !== userId) throw new NotFoundException('Không tìm thấy đơn');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { gems: true } });

    return { ...this.view(order), balance: user?.gems ?? 0 };
  }

  async history(userId: string) {
    const orders = await this.prisma.paymentOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return orders.map((o) => this.view(o));
  }
}
