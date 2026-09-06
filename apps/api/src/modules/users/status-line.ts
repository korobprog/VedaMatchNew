import { BadRequestException } from '@nestjs/common';
import { STATUS_LINE_MAX_LENGTH } from '@vedamatch/shared';

/**
 * Статус к записи в базу.
 *
 * Отдельной функцией, потому что правил здесь три и все три легко потерять
 * при следующей правке формы: длина, схлопывание пробелов и «пусто — значит
 * убрать».
 *
 * Переводы строк схлопываются, а не запрещаются: статус вставляют из
 * мессенджера вместе с переносами, и отказывать за это значит спорить с
 * человеком о том, как он держит буфер обмена. В карточке строка стоит рядом
 * с именем, и абзац сломал бы вёрстку — поэтому именно схлопываем.
 */
export function normalizeStatusLine(value: string | null | undefined): string | null {
  const line = (value ?? '').replace(/\s+/g, ' ').trim();
  if (line.length > STATUS_LINE_MAX_LENGTH)
    throw new BadRequestException(
      `Статус не длиннее ${STATUS_LINE_MAX_LENGTH} символов`,
    );
  // Пустая строка — «убрать», как у духовного имени и рассказа о себе:
  // различать пустой статус и отсутствующий пришлось бы во всех показах.
  return line || null;
}
