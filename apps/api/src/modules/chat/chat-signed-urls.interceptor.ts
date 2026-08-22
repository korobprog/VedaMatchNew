import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, mergeMap } from 'rxjs';
import { ChatUploadsService } from './chat-uploads.service';
import { collectStorageUrls, replaceStorageUrls } from './chat-signed-urls';

/**
 * Подписывает ссылки на файлы переписки во всём, что сервис отдаёт наружу.
 *
 * Одним перехватчиком, а не в каждом месте сборки DTO: сообщения уходят из
 * тринадцати мест — лента, отправка, правка, пересылка, комментарии, поиск,
 * закреплённое, последнее в списке бесед, админка, — и достаточно забыть одно,
 * чтобы у человека снова появилось пустое облачко вместо фотографии.
 *
 * Заодно накрывает картинки групп и каналов: они лежат в том же закрытом
 * бакете и ломались так же.
 */
/**
 * Пометка «здесь адрес нужен прямой». Стоит на загрузке файла: клиент
 * возвращает полученный адрес обратно в сообщение, и подписанный осел бы в
 * базе вместе со своим сроком годности — а на чтении подписался бы второй раз,
 * превратив первую подпись в часть имени объекта.
 */
export const RAW_STORAGE_URLS = 'chat.rawStorageUrls';
export const RawStorageUrls = () => SetMetadata(RAW_STORAGE_URLS, true);

@Injectable()
export class ChatSignedUrlsInterceptor implements NestInterceptor {
  constructor(
    private readonly uploads: ChatUploadsService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.get<boolean>(
      RAW_STORAGE_URLS,
      context.getHandler(),
    );
    if (raw) return next.handle();
    return next.handle().pipe(mergeMap((payload) => from(this.sign(payload))));
  }

  async sign(payload: unknown): Promise<unknown> {
    const prefix = this.uploads.storagePrefix;
    if (!prefix) return payload;

    const urls = collectStorageUrls(payload, prefix);
    if (urls.length === 0) return payload;

    const signed = new Map(
      await Promise.all(
        urls.map(
          async (url) =>
            [url, await this.uploads.signPublicUrl(url)] as [string, string],
        ),
      ),
    );
    return replaceStorageUrls(payload, signed);
  }
}
