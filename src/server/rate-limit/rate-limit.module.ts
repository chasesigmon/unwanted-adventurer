import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SocketConnectionLimiterService } from './socket-connection-limiter.service.js';

@Module({
  imports: [ConfigModule],
  providers: [SocketConnectionLimiterService],
  exports: [SocketConnectionLimiterService],
})
export class RateLimitModule {}
