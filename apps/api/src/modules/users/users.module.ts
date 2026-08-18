import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    // Apply JwtAuthGuard globally to all routes
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [UsersService],
})
export class UsersModule {}
