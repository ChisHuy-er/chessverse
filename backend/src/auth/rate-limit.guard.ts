import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  body?: { identifier?: unknown };
}

// Bộ đếm lưu trong bộ nhớ: khởi động lại server thì được đặt lại từ đầu.
const buckets = new Map<string, Bucket>();

// Dọn các bộ đếm đã hết hạn mỗi phút để không tốn bộ nhớ.
setInterval(() => {
  const now = Date.now();

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 60 * 1000).unref();

// Trả về true nếu lượt này còn nằm trong giới hạn.
function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;

  return bucket.count <= limit;
}

// Mọi yêu cầu đều đi qua server Next.js, nên IP thật của người dùng
// được Next.js chuyển sang backend qua header x-forwarded-for.
function getClientIp(req: RequestLike): string {
  const header = req.headers['x-forwarded-for'];
  const value = Array.isArray(header) ? header[0] : header;
  const first = value?.split(',')[0]?.trim();

  return first || req.ip || 'unknown';
}

function tooManyRequests(message: string): never {
  throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Đăng nhập: tối đa 10 lần / 15 phút cho mỗi tài khoản,
// và 30 lần / 15 phút cho mỗi địa chỉ IP.
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestLike>();

    const ip = getClientIp(req);

    const identifier =
      typeof req.body?.identifier === 'string'
        ? req.body.identifier.trim().toLowerCase().slice(0, 255)
        : '';

    const ipAllowed = hit(`login:ip:${ip}`, 30, FIFTEEN_MINUTES);

    const accountAllowed = identifier
      ? hit(`login:account:${identifier}`, 10, FIFTEEN_MINUTES)
      : true;

    if (!ipAllowed || !accountAllowed) {
      tooManyRequests(
        'Bạn thử đăng nhập quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.',
      );
    }

    return true;
  }
}

// Đăng ký: tối đa 5 tài khoản / giờ cho mỗi địa chỉ IP.
@Injectable()
export class RegisterRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestLike>();

    const ip = getClientIp(req);

    if (!hit(`register:ip:${ip}`, 5, ONE_HOUR)) {
      tooManyRequests(
        'Bạn tạo tài khoản quá nhiều lần. Vui lòng thử lại sau 1 giờ.',
      );
    }

    return true;
  }
}