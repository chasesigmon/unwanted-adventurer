import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AuthService } from './auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { credentialsSchema, registerAccountSchema, type CredentialsDto, type RegisterAccountDto } from './dto/credentials.dto.js';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Registers an ACCOUNT — email/username/password only, no race and no
  // character. The returned token is account-level; the client picks (or
  // creates) a character next (see characters.controller.ts) before it
  // ever gets a token the game socket will accept.
  @Post('register')
  @UsePipes(new ZodValidationPipe(registerAccountSchema))
  async register(@Body() body: RegisterAccountDto): Promise<{ ok: true; token: string }> {
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
