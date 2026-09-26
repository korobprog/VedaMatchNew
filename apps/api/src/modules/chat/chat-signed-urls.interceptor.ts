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
import {
  collectAvatarKeys,
  collectStorageUrls,
  replaceStorageUrls,
} from './chat-signed-urls';
import { PeopleAvatarService } from './people/people-avatar.service';

/**
 * Подписывает ссылки на файлы переписки во всём, что сервис отдаёт наружу.
 *
 * Одним перехватчиком, а не в каждом месте сборки DTO: сообщения уходят из
 * тринадцати мест — лента, отправка, правка, пересылка, комментарии, поиск,
 * закреплённое, последнее в списке бесед, админка, — и достаточно забыть одно,
 * чтобы у человека снова появилось пустое облачко вместо фотографии.
 *
 * Заодно накрывает картинки групп и каналов: они лежат в том же закрытом
 * бакете и ломались так же, — и загруженные фото людей (VED-492): DTO
 * собеседника помечен ключом фото (`attachAvatarKey`), и здесь пометка
 * превращается в подписанный `avatarUrl`.
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
    private readonly avatars: PeopleAvatarService,
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
    const urls = prefix ? collectStorageUrls(payload, prefix) : [];
    const avatarKeys = collectAvatarKeys(payload);
    if (urls.length === 0 && avatarKeys.length === 0) return payload;

    const [signed, avatars] = await Promise.all([
      Promise.all(
        urls.map(
          async (url) =>
            [url, await this.uploads.signPublicUrl(url)] as [string, string],
        ),
      ),
      // Фото людей — своей подписью, стабильной на сутки: иначе браузер
      // качал бы аватарку заново на каждом ответе (VED-498).
      Promise.all(
        avatarKeys.map(
          async (avatarKey) =>
            [
              avatarKey,
              await this.avatars.resolveAvatarUrl({
                avatarKey,
                avatarUrl: null,
              }),
            ] as [string, string | null],
        ),
      ),
    ]);
    return replaceStorageUrls(payload, new Map(signed), new Map(avatars));
  }
}
