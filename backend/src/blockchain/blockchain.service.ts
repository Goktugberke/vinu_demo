import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BlockchainService implements OnModuleInit, OnModuleDestroy {
  private provider!: ethers.WebSocketProvider;
  private readonly logger = new Logger(BlockchainService.name);
  private contract!: ethers.Contract;
  private decimals!: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    const url = this.configService.get<string>('ETH_WSS_URL');
    const address = this.configService.get<string>('USDT_CONTRACT_ADDRESS');
    const abi = [
      'event Transfer(address indexed from, address indexed to, uint256 value)',
    ];
    const decimalsRaw = this.configService.get<string>('USDT_DECIMALS');
    if (!decimalsRaw) throw new Error('USDT_DECIMALS is not defined');
    this.decimals = parseInt(decimalsRaw, 10);
    const minRaw = this.configService.get<string>('MIN_TRANSFER_USDT');

    if (!url || !address || !minRaw) {
      this.logger.error(
        'ETH_WSS_URL, USDT_CONTRACT_ADDRESS, or MIN_TRANSFER_USDT is not defined in environment variables',
      );
      throw new Error(
        'One or more required environment variables are not defined',
      );
    }
    const THRESHOLD = BigInt(minRaw) * 10n ** BigInt(this.decimals);

    this.provider = new ethers.WebSocketProvider(url);

    this.contract = new ethers.Contract(address, abi, this.provider);
    await this.contract.on(
      'Transfer',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (
        from: string,
        to: string,
        value: bigint,
        { log }: ethers.ContractEventPayload,
      ) => {
        if (value < THRESHOLD) {
          return;
          //do nothing if transfer is below threshold
        }
        this.logger.log(
          `Transfer: ${from} → ${to}, ${ethers.formatUnits(value, this.decimals)} USDT, tx: ${log.transactionHash}, block: ${log.blockNumber}`,
        );
        await this.notificationsService.sendTransferNotification({
          from,
          to,
          amount: ethers.formatUnits(value, this.decimals),
          txHash: log.transactionHash,
        });
      },
    );
  }

  async onModuleDestroy() {
    await this.provider.destroy();
  }
}
