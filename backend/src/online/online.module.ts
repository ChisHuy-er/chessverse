
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { OnlineGateway } from './online.gateway';
import { StockfishService } from './stockfish.service';
import { OnlineHistoryController } from './online-history.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [OnlineHistoryController],
  providers: [
    OnlineGateway,
    StockfishService,
    JwtAuthGuard,
  ],
})
export class OnlineModule {}
