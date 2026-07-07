import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AuthService } from './auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  credentialsSchema,
  registerCredentialsSchema,
  type CredentialsDto,
  type RegisterCredentialsDto,
} from './dto/credentials.dto.js';

// Rate-limited as a whole (register/login/logout) to blunt credential-
// stuffing and registration-spam attempts against the HTTP surface —
// matches the original express-rate-limit scope exactly.
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(registerCredentialsSchema))
  async register(@Body() body: RegisterCredentialsDto): Promise<{ ok: true; token: string }> {
    const { token } = await this.authService.register(body);
    return { ok: true, token };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(credentialsSchema))
  async login(@Body() body: CredentialsDto): Promise<{ ok: true; token: string }> {
    const { token } = await this.authService.login(body);
    return { ok: true, token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('authorization') authorization?: string): Promise<{ ok: true }> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
    if (!token) {
      throw new BadRequestException('Missing session token.');
    }
    await this.authService.logout(token);
    return { ok: true };
  }
}
