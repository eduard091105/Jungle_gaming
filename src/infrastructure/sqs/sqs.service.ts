import { Injectable } from '@nestjs/common';
import {
  CreateQueueCommand,
  DeleteMessageCommand,
  ListQueuesCommand,
  Message,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  SQSClientConfig,
} from '@aws-sdk/client-sqs';

@Injectable()
export class SqsService {
  private readonly client: SQSClient;

  constructor() {
    const config: SQSClientConfig = {
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
      },
    };

    if (process.env.SQS_ENDPOINT_URL) {
      config.endpoint = process.env.SQS_ENDPOINT_URL;
    }

    this.client = new SQSClient(config);
  }

  async ready(): Promise<boolean> {
    try {
      await this.client.send(new ListQueuesCommand({}));
      return true;
    } catch {
      return false;
    }
  }

  async sendMessage(queueUrl: string, body: string): Promise<string> {
    const result = await this.client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
      }),
    );

    return result.MessageId ?? 'generated';
  }

  async getQueueUrl(queueName: string, configuredUrl?: string): Promise<string> {
    if (configuredUrl) {
      return configuredUrl;
    }

    const result = await this.client.send(new CreateQueueCommand({ QueueName: queueName }));
    if (!result.QueueUrl) {
      throw new Error(`Could not resolve SQS queue URL for ${queueName}`);
    }
    return result.QueueUrl;
  }

  async receiveMessages(
    queueUrl: string,
    maxNumberOfMessages = 10,
    waitTimeSeconds = 5,
  ): Promise<Message[]> {
    const result = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxNumberOfMessages,
        WaitTimeSeconds: waitTimeSeconds,
      }),
    );

    return result.Messages ?? [];
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }));
  }
}
