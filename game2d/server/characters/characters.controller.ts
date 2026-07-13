import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AuthService, type CharacterSummary } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { createCharacterSchema, type CreateCharacterDto } from '../auth/dto/credentials.dto.js';

// Sits behind an ACCOUNT-level session token (see AuthService's own
// verifyAccountToken) — everything here is "what can this logged-in
// account do with its own roster of characters," not gameplay itself.
// Picking (or creating) a character issues the character-level token the
// game socket actually connects with (see selectCharacter).
@Controller('characters')
@UseGuards(ThrottlerGuard)
export class CharactersController {
  constructor(private readonly authService: AuthService) {}

  private extractBearerToken(authorization?: string): string {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
    if (!token) {
      throw new BadRequestException('Missing session token.');
    }
    return token;
  }

  @Get()
  async list(@Headers('authorization') authorization?: string): Promise<{ ok: true; characters: CharacterSummary[] }> {
    const token = this.extractBearerToken(authorization);
    const characters = await this.authService.listCharacters(token);
    return { ok: true, characters };
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createCharacterSchema))
  async create(
    @Body() body: CreateCharacterDto,
    @Headers('authorization') authorization?: string
  ): Promise<{ ok: true; character: CharacterSummary }> {
    const token = this.extractBearerToken(authorization);
    const character = await this.authService.createCharacter(token, body);
    return { ok: true, character };
  }

  @Post(':name/select')
  @HttpCode(HttpStatus.OK)
  async select(
    @Param('name') name: string,
    @Headers('authorization') authorization?: string
  ): Promise<{ ok: true; token: string }> {
    const token = this.extractBearerToken(authorization);
    const { token: characterToken } = await this.authService.selectCharacter(token, name);
    return { ok: true, token: characterToken };
  }

  // A follow-up ask: "the ability for people to delete players from
  // their character selection page" — permanent, unlike condemned.
  @Delete(':name')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('name') name: string, @Headers('authorization') authorization?: string): Promise<{ ok: true }> {
    const token = this.extractBearerToken(authorization);
    await this.authService.deleteCharacter(token, name);
    return { ok: true };
  }
}
