import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { TransferPayload } from './types/transfer-payload.type';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private app!: admin.app.App;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const { projectId, clientEmail, privateKey } = this.loadCredentials();
    this.app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    this.logger.log('Firebase Admin initialized successfully');
  }

  async sendTransferNotification(payload: TransferPayload): Promise<void> {
    const topic = this.requireTopic();
    if (!topic) return;

    try {
      const messageId = await admin.messaging().send({
        topic,
        notification: {
          title: 'Large USDT Transfer',
          body: `${payload.amount} USDT from ${payload.from.slice(0, 8)}... to ${payload.to.slice(0, 8)}...`,
        },
        data: {
          fromAddress: payload.from,
          toAddress: payload.to,
          amount: payload.amount,
          txHash: payload.txHash,
        },
      });
      this.logger.log(`FCM sent: ${messageId}`);
    } catch (err) {
      this.logger.error('FCM send failed', err);
    }
  }

  async subscribeToTopic(token: string): Promise<void> {
    const topic = this.requireTopic();
    if (!topic) throw new Error('FCM_TOPIC is not defined');

    const response = await admin.messaging().subscribeToTopic([token], topic);
    this.logger.log(
      `Subscribed to topic '${topic}': ${response.successCount} success, ${response.failureCount} failure`,
    );
    if (response.failureCount > 0) {
      this.logger.error(`Subscribe errors: ${JSON.stringify(response.errors)}`);
      throw new Error('Failed to subscribe token to topic');
    }
  }

  private loadCredentials(): {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  } {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.error('Firebase credentials missing in env');
      throw new Error('Firebase credentials missing in env');
    }
    return { projectId, clientEmail, privateKey };
  }

  private requireTopic(): string | null {
    const topic = this.configService.get<string>('FCM_TOPIC');
    if (!topic) {
      this.logger.error('FCM_TOPIC is not defined');
      return null;
    }
    return topic;
  }
}
