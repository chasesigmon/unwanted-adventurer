import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

// Wraps a zod schema as a Nest pipe so controllers get automatic 400s on
// invalid input, without reaching for class-validator/DTO decorators.
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues[0]?.message ?? 'Invalid input.');
    }
    return result.data;
  }
}
