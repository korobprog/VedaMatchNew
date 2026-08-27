import {
  METADATA_PREFIX_BYTES,
  estimateDurationSeconds,
  readId3v2Size,
  resolveDurationSeconds,
} from './music-duration-estimate';

/** Заголовок ID3v2 с синхробезопасным размером. */
function id3Header(payloadBytes: number): Uint8Array {
  const head = new Uint8Array(16);
  head[0] = 0x49; // I
  head[1] = 0x44; // D
  head[2] = 0x33; // 3
  head[6] = (payloadBytes >> 21) & 0x7f;
  head[7] = (payloadBytes >> 14) & 0x7f;
  head[8] = (payloadBytes >> 7) & 0x7f;
  head[9] = payloadBytes & 0x7f;
  return head;
}

describe('readId3v2Size', () => {
  it('читает размер тега вместе с заголовком', () => {
    expect(readId3v2Size(id3Header(87030))).toBe(87040);
  });

  it('без тега отдаёт ноль', () => {
    expect(readId3v2Size(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe(0);
  });

  it('на обрезанном начале не падает', () => {
    expect(readId3v2Size(new Uint8Array([0x49, 0x44]))).toBe(0);
  });

  it('пустой тег считает отсутствующим', () => {
    expect(readId3v2Size(id3Header(0))).toBe(0);
  });

  it('старший бит в байтах размера игнорируется', () => {
    // Синхробезопасность: 0xff в байте значит 0x7f, а не 255.
    const head = id3Header(0);
    head[6] = 0xff;
    head[7] = 0xff;
    head[8] = 0xff;
    head[9] = 0xff;

    expect(readId3v2Size(head)).toBe(0x0fffffff + 10);
  });
});

describe('estimateDurationSeconds', () => {
  it('считает по объёму аудио и битрейту', () => {
    // Настоящая запись: 6 260 425 байт, тег 87 040, 320 kbps → 154 секунды.
    expect(estimateDurationSeconds(6_260_425, 320, 87_040)).toBe(154);
  });

  it('без вычета тега завышает — за это его и вычитаем', () => {
    expect(estimateDurationSeconds(6_260_425, 320, 0)).toBe(157);
  });

  it('без битрейта считать нечем', () => {
    expect(estimateDurationSeconds(6_260_425, 0, 0)).toBeNull();
  });

  it('тег больше файла не даёт отрицательной длительности', () => {
    expect(estimateDurationSeconds(1000, 320, 5000)).toBeNull();
  });

  it('обрезок, который округляется в ноль, — это не длительность', () => {
    expect(estimateDurationSeconds(123, 192, 0)).toBeNull();
  });
});

describe('resolveDurationSeconds', () => {
  const base = {
    parsedSeconds: 154,
    bitrateKbps: 320,
    sizeBytes: 6_260_425,
    tagBytes: 87_040,
    readBytes: METADATA_PREFIX_BYTES,
  };

  it('прочитали весь объект — верим разбору', () => {
    expect(
      resolveDurationSeconds({
        ...base,
        parsedSeconds: 154,
        readBytes: base.sizeBytes,
      }),
    ).toBe(154);
  });

  it('разбор посчитал только префикс — берём оценку', () => {
    // Ровно тот случай, что поймала настоящая запись: 24 вместо 154.
    expect(resolveDurationSeconds({ ...base, parsedSeconds: 24 })).toBe(154);
  });

  it('разбор сошёлся с оценкой — оставляем разбор', () => {
    // У VBR с заголовком Xing точная длительность лежит в начале файла, и
    // подменять её оценкой было бы шагом назад.
    expect(resolveDurationSeconds({ ...base, parsedSeconds: 150 })).toBe(150);
  });

  it('расхождение в пределах допуска разбору не мешает', () => {
    expect(resolveDurationSeconds({ ...base, parsedSeconds: 140 })).toBe(140);
  });

  it('за пределами допуска побеждает оценка', () => {
    expect(resolveDurationSeconds({ ...base, parsedSeconds: 100 })).toBe(154);
  });

  it('разбор молчит — берём оценку', () => {
    expect(resolveDurationSeconds({ ...base, parsedSeconds: null })).toBe(154);
  });

  it('нечем ни разобрать, ни оценить — честный null', () => {
    // Валидатор откажет с «не удалось прочитать длительность», а не заведёт
    // в каталоге вечно короткую запись.
    expect(
      resolveDurationSeconds({
        ...base,
        parsedSeconds: 24,
        bitrateKbps: null,
      }),
    ).toBeNull();
  });

  it('маленький файл целиком в префиксе — верим разбору как есть', () => {
    expect(
      resolveDurationSeconds({
        parsedSeconds: 7,
        bitrateKbps: 320,
        sizeBytes: 104_250,
        tagBytes: 0,
        readBytes: METADATA_PREFIX_BYTES,
      }),
    ).toBe(7);
  });
});
