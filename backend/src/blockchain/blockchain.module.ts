import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  providers: [BlockchainService],
  imports: [NotificationsModule],
})
export class BlockchainModule {}
