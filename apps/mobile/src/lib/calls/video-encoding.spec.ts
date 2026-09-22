import {
  DEGRADATION_PREFERENCE,
  videoEncodingFor,
  withVideoEncoding,
  type SenderParameters,
} from './video-encoding';

describe('videoEncodingFor', () => {
  it('Wi-Fi и Ethernet — полный кадр и высокий потолок', () => {
    const wide = videoEncodingFor('wifi');
    expect(wide.scaleResolutionDownBy).toBe(1);
    expect(videoEncodingFor('ethernet')).toEqual(wide);
  });

  it('сотовая сеть — потолок ниже и кадр вдвое меньше стороной', () => {
    const narrow = videoEncodingFor('cellular');
    const wide = videoEncodingFor('wifi');
    expect(narrow.maxBitrate).toBeLessThan(wide.maxBitrate);
    expect(narrow.scaleResolutionDownBy).toBe(2);
  });

  it('неизвестный транспорт и отсутствие сети экономят трафик, а не тратят', () => {
    const narrow = videoEncodingFor('cellular');
    expect(videoEncodingFor('other')).toEqual(narrow);
    expect(videoEncodingFor('none')).toEqual(narrow);
    expect(videoEncodingFor(null)).toEqual(narrow);
  });
});

describe('withVideoEncoding', () => {
  const target = videoEncodingFor('cellular');

  it('проставляет потолок каждому encoding и режим деградации', () => {
    const params: SenderParameters = { transactionId: 'tx-1', encodings: [{ active: true }] };

    const next = withVideoEncoding(params, target)!;

    expect(next.encodings).toEqual([{ active: true, ...target }]);
    expect(next.degradationPreference).toBe(DEGRADATION_PREFERENCE);
  });

  it('сохраняет поля, которые вернул getParameters, — иначе setParameters отвергнут', () => {
    const params: SenderParameters = {
      transactionId: 'tx-2',
      codecs: [{ mimeType: 'video/VP8' }],
      encodings: [{ rid: 'h', active: true }],
    };

    const next = withVideoEncoding(params, target)!;

    expect(next.transactionId).toBe('tx-2');
    expect(next.codecs).toEqual([{ mimeType: 'video/VP8' }]);
    expect(next.encodings![0].rid).toBe('h');
  });

  it('не трогает исходный объект', () => {
    const params: SenderParameters = { encodings: [{ active: true }] };

    withVideoEncoding(params, target);

    expect(params.encodings).toEqual([{ active: true }]);
  });

  it('потолок уже стоит — менять нечего, лишнего вызова через мост не будет', () => {
    const params: SenderParameters = {
      encodings: [{ ...target }],
      degradationPreference: DEGRADATION_PREFERENCE,
    };

    expect(withVideoEncoding(params, target)).toBeNull();
  });

  it('стоит потолок другой сети — параметры пересобираются', () => {
    const params: SenderParameters = {
      encodings: [{ ...videoEncodingFor('wifi') }],
      degradationPreference: DEGRADATION_PREFERENCE,
    };

    expect(withVideoEncoding(params, target)).not.toBeNull();
  });

  it('накладывать не на что — ни пустой список encodings, ни его отсутствие не выдумывают encoding', () => {
    expect(withVideoEncoding({ encodings: [] }, target)).toBeNull();
    expect(withVideoEncoding({}, target)).toBeNull();
    expect(withVideoEncoding({ encodings: undefined }, target)).toBeNull();
  });
});
