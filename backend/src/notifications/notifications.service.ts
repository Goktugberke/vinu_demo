import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private app!: admin.app.App;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n'); // Handle escaped newlines

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.error(
        'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY is not defined in environment variables',
      );
      throw new Error(
        'One or more required environment variables for Firebase are not defined',
      );
    }

    this.app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });

    this.logger.log('Firebase Admin initialized successfully');
  }

  async sendTransferNotification(payload: {
    from: string;
    to: string;
    amount: string;
    txHash: string;
  }): Promise<void> {
    const topic = this.configService.get<string>('FCM_TOPIC');
    if (!topic) {
      this.logger.error('FCM_TOPIC is not defined');
      return;
    }

    try {
      const messageId = await admin.messaging().send({
        topic: topic,
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
      this.logger.error(`FCM send failed: ${err}`);
    }
  }
}
