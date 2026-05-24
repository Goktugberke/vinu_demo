import { IsString, Matches } from 'class-validator';

export class SubscribeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_:-]+$/, { message: 'Invalid FCM token format' })
  token!: string;
}
