import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { NotificationsService } from '../notifications/notifications.service';
import { TransferPayload } from '../notifications/types/transfer-payload.type';

const TRANSFER_EVENT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

const DEDUP_CACHE_MAX = 1000;

@Injectable()
export class BlockchainService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainService.name);
  private provider!: ethers.WebSocketProvider;
  private contract!: ethers.Contract;
  private decimals!: number;
  private threshold!: bigint;

  private readonly seenLogs = new Set<string>();
  private readonly seenLogsOrder: string[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const { wssUrl, contractAddress, minTransfer, decimals } =
      this.loadConfig();
    this.decimals = decimals;
    this.threshold = BigInt(minTransfer) * 10n ** BigInt(decimals);

    this.provider = new ethers.WebSocketProvider(wssUrl);
    this.contract = new ethers.Contract(
      contractAddress,
      TRANSFER_EVENT_ABI,
      this.provider,
    );

    await this.contract.on('Transfer', this.handleTransfer);
    this.logger.log(`Listening Transfer events; threshold=${minTransfer} USDT`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.provider?.destroy();
  }

  private handleTransfer = async (
    from: string,
    to: string,
    value: bigint,
    { log }: ethers.ContractEventPayload,
  ): Promise<void> => {
    if (value < this.threshold) return;

    const logKey = `${log.transactionHash}:${log.index}`;
    if (this.seenLogs.has(logKey)) {
      this.logger.warn(`Duplicate event skipped: ${logKey}`);
      return;
    }
    this.markSeen(logKey);

    const amount = ethers.formatUnits(value, this.decimals);
    this.logger.log(
      `Transfer: ${from} → ${to}, ${amount} USDT, tx: ${log.transactionHash}, block: ${log.blockNumber}`,
    );

    const payload: TransferPayload = {
      from,
      to,
      amount,
      txHash: log.transactionHash,
    };
    await this.notificationsService.sendTransferNotification(payload);
  };

  private markSeen(key: string): void {
    this.seenLogs.add(key);
    this.seenLogsOrder.push(key);
    if (this.seenLogsOrder.length > DEDUP_CACHE_MAX) {
      const oldest = this.seenLogsOrder.shift();
      if (oldest) this.seenLogs.delete(oldest);
    }
  }

  private loadConfig(): {
    wssUrl: string;
    contractAddress: string;
    minTransfer: string;
    decimals: number;
  } {
    const wssUrl = this.configService.get<string>('ETH_WSS_URL');
    const contractAddress = this.configService.get<string>(
      'USDT_CONTRACT_ADDRESS',
    );
    const minTransfer = this.configService.get<string>('MIN_TRANSFER_USDT');
    const decimalsRaw = this.configService.get<string>('USDT_DECIMALS');

    if (!wssUrl || !contractAddress || !minTransfer || !decimalsRaw) {
      this.logger.error(
        'Missing required env: ETH_WSS_URL, USDT_CONTRACT_ADDRESS, MIN_TRANSFER_USDT, USDT_DECIMALS',
      );
      throw new Error('Missing required blockchain env vars');
    }

    return {
      wssUrl,
      contractAddress,
      minTransfer,
      decimals: parseInt(decimalsRaw, 10),
    };
  }
}
