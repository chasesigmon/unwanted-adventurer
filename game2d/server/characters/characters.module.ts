import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CharactersController } from './characters.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [CharactersController],
})
export class CharactersModule {}
