import { buildImageDataUri, encodedSizeBytes } from './image-data-uri';

describe('buildImageDataUri', () => {
  it('собирает data-URI с указанным типом', () => {
    expect(buildImageDataUri(Buffer.from('кадр'), 'image/jpeg')).toBe(
      'data:image/jpeg;base64,' + Buffer.from('кадр').toString('base64'),
    );
  });

  it('по умолчанию считает кадр JPEG — именно его готовит prepareFrame', () => {
    expect(buildImageDataUri(Buffer.from([1, 2, 3]))).toMatch(
      /^data:image\/jpeg;base64,/,
    );
  });

  it('переживает пустой буфер, не выдумывая содержимое', () => {
    expect(buildImageDataUri(Buffer.alloc(0))).toBe('data:image/jpeg;base64,');
  });

  it('кодирует байты обратимо', () => {
    const source = Buffer.from([0, 255, 128, 7, 200]);
    const uri = buildImageDataUri(source);
    const back = Buffer.from(uri.split(',')[1], 'base64');
    expect(back.equals(source)).toBe(true);
  });
});

describe('encodedSizeBytes', () => {
  it('учитывает разбухание на треть', () => {
    expect(encodedSizeBytes(230523)).toBe(307364);
  });

  it.each([
    [0, 0],
    [1, 4],
    [3, 4],
    [4, 8],
  ])('дополняет до кратности четырём: %i -> %i', (raw, encoded) => {
    expect(encodedSizeBytes(raw)).toBe(encoded);
  });

  it('совпадает с настоящей длиной base64', () => {
    for (const size of [1, 2, 3, 100, 4096]) {
      const real = Buffer.alloc(size).toString('base64').length;
      expect(encodedSizeBytes(size)).toBe(real);
    }
  });
});
