import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GeoHints, detectCountry } from './geo';

// Quà cho tài khoản thử nghiệm
const TEST_GIFT = { gems: 300, coins: 1000 };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto, geo: GeoHints = {}) {
    const email = dto.email.toLowerCase();
    const username = dto.username.toLowerCase();

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'Email hoặc username đã được sử dụng',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          username,
          passwordHash,
          displayName: dto.displayName,
          country: detectCountry(geo),
        },
      });

      const accessToken = await this.generateToken(user);

      return {
        message: 'Đăng ký tài khoản thành công',
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          country: user.country,
          elo: user.elo,
          createdAt: user.createdAt,
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Email hoặc username đã được sử dụng',
        );
      }

      throw error;
    }
  }

  async login(dto: LoginDto, geo: GeoHints = {}) {
    const identifier = dto.identifier.toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Thông tin đăng nhập không chính xác',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'Thông tin đăng nhập không chính xác',
      );
    }

    // Tài khoản cũ chưa có quốc gia thì nhận diện ngay lần đăng nhập này
    if (!user.country) {
      const country = detectCountry(geo);

      if (country) {
        await this.prisma.user.update({ where: { id: user.id }, data: { country } });
        user.country = country;
      }
    }

    const accessToken = await this.generateToken(user);

    return {
      message: 'Đăng nhập thành công',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarId: user.avatarId,
        avatarFrame: user.avatarFrame,
        country: user.country,
        elo: user.elo,
        createdAt: user.createdAt,
      },
    };
  }

  private async generateToken(user: {
    id: string;
    email: string;
    username: string;
  }) {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      username: user.username,
    });
  }

  // Cấp ID người chơi ngẫu nhiên 8 chữ số, không trùng.
  private async assignPlayerCode(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = String(Math.floor(10_000_000 + Math.random() * 90_000_000));

      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { playerCode: code },
        });

        return code;
      } catch (error) {
        // Trùng mã (P2002) thì thử mã khác.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException('Không thể tạo ID người chơi, vui lòng thử lại');
  }

// Mỗi tài khoản thử nghiệm được tặng 300 kim cương + 1.000 xu (chỉ một lần)
private async giveTestGift(userId: string) {
  if (process.env.TEST_GIFT === 'false') return;

  const done = await this.prisma.questClaim.findUnique({
    where: { userId_questId_period: { userId, questId: 'test_gift', period: 'all' } },
    select: { id: true },
  });

  if (done) return;

  try {
    await this.prisma.$transaction(async (tx) => {
      await tx.questClaim.create({ data: { userId, questId: 'test_gift', period: 'all' } });

      const after = await tx.user.update({
        where: { id: userId },
        data: { gems: { increment: TEST_GIFT.gems }, coins: { increment: TEST_GIFT.coins } },
        select: { gems: true },
      });

      await tx.gemTransaction.create({
        data: { userId, delta: TEST_GIFT.gems, balance: after.gems, reason: 'REWARD', refId: 'test_gift' },
      });
    });
  } catch {
    // Hai yêu cầu đến cùng lúc: bản ghi trùng bị chặn, quà chỉ cộng một lần
  }
}

async getMe(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      avatarId: true,
      avatarFrame: true,
      playerCode: true,
      country: true,
      elo: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new UnauthorizedException('Tài khoản không tồn tại');
  }

  // Tài khoản chưa có ID người chơi (#12345678) thì cấp ngay.
  if (!user.playerCode) {
    user.playerCode = await this.assignPlayerCode(user.id);
  }

  // Quà thử nghiệm: mỗi tài khoản nhận một lần (tắt bằng TEST_GIFT=false trong .env)
  await this.giveTestGift(user.id);

  return {
    message: 'Lấy thông tin tài khoản thành công',
    user,
    };
}

  async createOnlineSocketToken(userId: string) {
    const token = await this.jwtService.signAsync(
      {
        sub: userId,
        purpose: 'online_socket',
      },
      {
        expiresIn: '2m',
      },
    );

    return { token };
  }
}