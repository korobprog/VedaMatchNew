import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import {
  buildFcmMessage,
  classifyFcmError,
  GOOGLE_TOKEN_URL,
  parseServiceAccount,
  signServiceAccountAssertion,
  type PushPayload,
  type ServiceAccount,
} from './fcm';
import type { PushFailure } from './push-errors';

/** Токен Google живёт час; обновляем заранее, чтобы не поймать истечение в полёте. */
const TOKEN_SAFETY_MS = 5 * 60_000;

/**
 * Отправка пушей в приложение через FCM HTTP v1.
 *
 * Ключ сервисного аккаунта берётся из `FIREBASE_SERVICE_ACCOUNT` (JSON или
 * base64 от JSON) или из файла `FIREBASE_SERVICE_ACCOUNT_FILE`. Без ключа
 * сервис молча выключен, как веб-пуши без VAPID.
 */
@Injectable()
export class FcmSenderService {
  private readonly logger = new Logger(FcmSenderService.name);
  private readonly account: ServiceAccount | null;
  private token: { value: string; expiresAt: number } | null = null;
  private pendingToken: Promise<string> | null = null;

  constructor(config: ConfigService) {
    let raw = config.get<string>('FIREBASE_SERVICE_ACCOUNT');
    const file = config.get<string>('FIREBASE_SERVICE_ACCOUNT_FILE');
    if (!raw && file) {
      try {
        raw = readFileSync(file, 'utf8');
      } catch (error) {
        this.logger.warn(
          `Ключ FCM не прочитан из файла: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.account = parseServiceAccount(raw);
    if (!this.account) {
      this.logger.warn('Ключ FCM не задан: пуши в приложение отключены');
    }
  }

  get configured(): boolean {
    return this.account !== null;
  }

  /** Никогда не бросает: вызывается из слушателей событий и воркера. */
  async send(token: string, payload: PushPayload): Promise<PushFailure | null> {
    if (!this.account) return 'transient';
    return this.post(buildFcmMessage(token, payload));
  }

  /**
   * Тело сообщения собрано снаружи (data-only пуши звонка —
   * `buildCallIncomingMessage`/`buildCallEndedMessage`): здесь только сеть,
   * токен доступа и разбор ответа, общие для любого вида FCM-сообщения.
   */
  async sendRaw(message: object): Promise<PushFailure | null> {
    if (!this.account) return 'transient';
    return this.post(message);
  }

  private async post(message: object): Promise<PushFailure | null> {
    const account = this.account;
    if (!account) return 'transient';
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
          account.projectId,
        )}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await this.accessToken(account)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        },
      );
      if (response.ok) return null;
      // Отозванный токен доступа: следующая попытка возьмёт новый.
      if (response.status === 401) this.token = null;
      const body: unknown = await response.json().catch(() => null);
      const failure = classifyFcmError(response.status, body);
      this.logger.warn(`FCM не доставил (${response.status}): ${failure}`);
      return failure;
    } catch (error) {
      this.logger.warn(
        `FCM недоступен: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'transient';
    }
  }

  private async accessToken(account: ServiceAccount): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now())
      return this.token.value;
    // Пачка пушей не должна просить у Google десять токенов одновременно.
    this.pendingToken ??= this.fetchAccessToken(account).finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async fetchAccessToken(account: ServiceAccount): Promise<string> {
    const assertion = signServiceAccountAssertion(
      account,
      Math.floor(Date.now() / 1000),
    );
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!response.ok) {
      throw new Error(`Google не выдал токен доступа (${response.status})`);
    }
    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000 - TOKEN_SAFETY_MS,
    };
    return data.access_token;
  }
}
