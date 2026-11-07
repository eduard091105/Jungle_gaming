import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { DatabaseService } from './infrastructure/database/database.service';
import { SqsService } from './infrastructure/sqs/sqs.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly databaseService: DatabaseService,
    private readonly sqsService: SqsService,
  ) {}

  @Get('/health/live')
  getLive(): { status: string } {
    return { status: 'ok' };
  }

  @Get('/health/ready')
  async getReady(): Promise<{ status: string; checks: { database: boolean; queue: boolean } }> {
    const databaseReady = await this.databaseService.ready();
    const queueReady = await this.sqsService.ready();

    return {
      status: databaseReady && queueReady ? 'ready' : 'degraded',
      checks: {
        database: databaseReady,
        queue: queueReady,
      },
    };
  }

  @Get('/')
  getRoot(): { name: string; status: string } {
    return {
      name: 'Jungle Gaming wagering processor',
      status: this.appService.getStatus(),
    };
  }
}
