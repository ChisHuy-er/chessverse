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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
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

  async login(dto: LoginDto) {
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

    const accessToken = await this.generateToken(user);

    return {
      message: 'Đăng nhập thành công',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
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
      elo: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new UnauthorizedException('Tài khoản không tồn tại');
  }

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