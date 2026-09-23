import { Injectable, Logger } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import {
  checkFetchUrl,
  htmlToText,
  isPublicAddress,
  SOURCE_MAX_BYTES,
  SOURCE_MAX_REDIRECTS,
} from './source-check';

const PAGE_TIMEOUT_MS = 8_000;
const USER_AGENT =
  'VedaMatch/1.0 (https://vedamatch.ru; wellness source check)';

/**
 * Сервер сам открывает страницу, которую назвал ИИ, и отдаёт её текст
 * (VED-384). Любой сбой — `null`: источник просто остаётся непроверенным, а
 * непроверенный источник карточку не принимает.
 *
 * Защита от SSRF — как у загрузчика «Музыки»: адрес проверяется до запроса,
 * имя резолвится и все его адреса обязаны быть публичными, пересылки идут
 * вручную и проверяются заново на каждом шаге. Не закрыто то же, что и там:
 * между резолвом и соединением имя может переехать (DNS rebinding). Цена
 * ошибки здесь меньше — ответ страницы никуда не отдаётся, из него только
 * ищется штрихкод.
 */
@Injectable()
export class WellnessSourceFetchService {
  private readonly log = new Logger(WellnessSourceFetchService.name);

  async fetchText(url: string): Promise<string | null> {
    let current = url;
    for (let hop = 0; hop <= SOURCE_MAX_REDIRECTS; hop += 1) {
      if (checkFetchUrl(current) !== null) return null;
      if (!(await this.resolvesPublic(new URL(current).hostname))) return null;

      let response: Response;
      try {
        response = await fetch(current, {
          redirect: 'manual',
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
          },
          signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });
      } catch (error) {
        this.log.debug(`Источник не открылся: ${String(error).slice(0, 120)}`);
        return null;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return null;
        try {
          current = new URL(location, current).toString();
        } catch {
          return null;
        }
        continue;
      }
      if (!response.ok) return null;
      const type = response.headers.get('content-type') ?? '';
      if (!/html|text\/plain|xml/i.test(type)) return null;
      const body = await this.readCapped(response);
      return body === null ? null : htmlToText(body);
    }
    return null;
  }

  private async resolvesPublic(hostname: string): Promise<boolean> {
    try {
      const records = await lookup(hostname, { all: true });
      return (
        records.length > 0 &&
        records.every((record) => isPublicAddress(record.address))
      );
    } catch {
      return false;
    }
  }

  /**
   * Первые `SOURCE_MAX_BYTES` тела. Хвост отрезается, а не бракует страницу:
   * витрины магазинов тяжёлые, но штрихкод и состав у них в начале — в
   * разметке JSON-LD и карточке товара.
   */
  private async readCapped(response: Response): Promise<string | null> {
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
        if (size >= SOURCE_MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
    } catch {
      return null;
    }
    return Buffer.concat(chunks).subarray(0, SOURCE_MAX_BYTES).toString('utf8');
  }
}
