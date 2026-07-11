import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Account } from './account.entity.js';

export interface NewAccountInput {
  email: string;
  username: string;
  passwordHash: string;
}

@Injectable()
export class AccountsService {
  constructor(@InjectRepository(Account) private readonly accountsRepo: Repository<Account>) {}

  findByUsernameCaseInsensitive(username: string): Promise<Account | null> {
    return this.accountsRepo
      .createQueryBuilder('account')
      .where('lower(account.username) = lower(:username)', { username })
      .getOne();
  }

  findByEmailCaseInsensitive(email: string): Promise<Account | null> {
    return this.accountsRepo
      .createQueryBuilder('account')
      .where('lower(account.email) = lower(:email)', { email })
      .getOne();
  }

  findById(id: number): Promise<Account | null> {
    return this.accountsRepo.findOneBy({ id });
  }

  async create(input: NewAccountInput): Promise<Account> {
    const account = this.accountsRepo.create(input);
    return this.accountsRepo.save(account);
  }
}
