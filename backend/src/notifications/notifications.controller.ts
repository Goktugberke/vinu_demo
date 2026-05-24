import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SubscribeDto } from './dto/subscribe.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(@Body() dto: SubscribeDto): Promise<void> {
    await this.notificationsService.subscribeToTopic(dto.token);
  }
}
