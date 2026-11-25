import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { OnlineGateway } from './online.gateway';
import { StockfishService } from './stockfish.service';
import { OnlineHistoryController } from './online-history.controller';
import { OnlineLeaderboardController } from './online-leaderboard.controller';
import { OnlineProfileController } from './online-profile.controller';
import { ClubController } from './club.controller';
import { PresenceController } from './presence.controller';
import { ShopController } from './shop.controller';
import { FriendsController } from './friends.controller';
import { ChallengesController } from './challenges.controller';
import { PresenceService } from './presence.service';
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
  controllers: [
    OnlineHistoryController,
    OnlineLeaderboardController,
    OnlineProfileController,
    ClubController,
    PresenceController,
    ShopController,
    FriendsController,
    ChallengesController,
  ],
  providers: [
    OnlineGateway,
    StockfishService,
    JwtAuthGuard,
    PresenceService,
  ],
})
export class OnlineModule {}
