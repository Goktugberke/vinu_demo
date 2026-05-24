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
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

@Injectable()
export class BlockchainService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainService.name);
  private provider!: ethers.WebSocketProvider;
  private contract!: ethers.Contract;
  private decimals!: number;
  private threshold!: bigint;
  private isShuttingDown = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly seenLogs = new Set<string>();
  private readonly seenLogsOrder: string[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const { minTransfer, decimals } = this.loadConfig();
    this.decimals = decimals;
    this.threshold = BigInt(minTransfer) * 10n ** BigInt(decimals);

    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.destroyProvider();
  }

  private async connect(): Promise<void> {
    const { wssUrl, contractAddress, minTransfer } = this.loadConfig();

    try {
      await this.destroyProvider();

      this.provider = new ethers.WebSocketProvider(wssUrl);

      const ws = (this.provider as any).websocket;
      if (ws) {
        ws.on('close', () => {
          if (!this.isShuttingDown) {
            this.logger.warn('WebSocket connection closed unexpectedly');
            this.scheduleReconnect();
          }
        });

        ws.on('error', (err: any) => {
          this.logger.error('WebSocket error', err);
        });
      }

      this.provider.on('error', (err: unknown) => {
        this.logger.error('Provider error', err);
      });

      this.contract = new ethers.Contract(
        contractAddress,
        TRANSFER_EVENT_ABI,
        this.provider,
      );

      this.contract.on('Transfer', this.handleTransfer);
      this.reconnectAttempts = 0;
      this.logger.log(
        `Connected — listening for Transfer events; threshold=${minTransfer} USDT`,
      );
    } catch (err) {
      this.logger.error('Failed to connect to Ethereum', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimer) return;

    const delay = Math.min(
      RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempts++;

    this.logger.warn(
      `Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, delay);
  }

  private async destroyProvider(): Promise<void> {
    try {
      if (this.contract) {
        this.contract.removeAllListeners();
      }
      if (this.provider) {
        await this.provider.destroy();
      }
    } catch {
    }
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

    try {
      await this.notificationsService.sendTransferNotification(payload);
    } catch (err) {
      this.logger.error('Failed to send notification', err);
    }
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
