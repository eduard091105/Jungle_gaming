import { MikroORM } from '@mikro-orm/postgresql';
import config from '../../../mikro-orm.config';

const direction = process.argv[2];
if (direction !== 'up' && direction !== 'down') {
  throw new Error('Expected migration direction: up or down');
}

const orm = await MikroORM.init(config);
try {
  if (direction === 'up') {
    await orm.getMigrator().up();
  } else {
    await orm.getMigrator().down();
  }
} finally {
  await orm.close(true);
}