import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DatabaseService {
  constructor(@Inject(EntityManager) readonly entityManager: EntityManager) {}

  async ready(): Promise<boolean> {
    try {
      await this.entityManager.fork().getConnection().execute('select 1');
      return true;
    } catch {
      return false;
    }
  }
}
