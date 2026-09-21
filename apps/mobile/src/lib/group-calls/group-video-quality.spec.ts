import { videoEncodingFor } from '@/lib/calls/video-encoding';
import {
  encodingChanged,
  groupVideoEncoding,
  MIN_GROUP_VIDEO_BITRATE,
} from './group-video-quality';

/**
 * Пересчёт качества при изменении состава — отдельная цель задачи: именно
 * он не даёт телефону сгореть на третьем собеседнике и он же обязан
 * ВЕРНУТЬ картинку, когда собеседники разошлись.
 */

describe('качество падает с ростом комнаты', () => {
  it('вдвоём — ровно потолок звонка один на один', () => {
    expect(groupVideoEncoding('wifi', 2)).toEqual(videoEncodingFor('wifi'));
  });

  it('втроём битрейт ниже, чем вдвоём', () => {
    expect(groupVideoEncoding('wifi', 3).maxBitrate).toBeLessThan(
      groupVideoEncoding('wifi', 2).maxBitrate,
    );
  });

  it('вчетвером ниже, чем втроём', () => {
    expect(groupVideoEncoding('wifi', 4).maxBitrate).toBeLessThan(
      groupVideoEncoding('wifi', 3).maxBitrate,
    );
  });

  it('битрейт не растёт ни на одном шаге, сторона кадра не уменьшается', () => {
    // Монотонность — главное свойство лестницы: любая правка чисел,
    // которая её ломает, означает «на пятом станет легче».
    for (let n = 2; n < 5; n += 1) {
      const smaller = groupVideoEncoding('wifi', n);
      const bigger = groupVideoEncoding('wifi', n + 1);
      expect(bigger.maxBitrate).toBeLessThanOrEqual(smaller.maxBitrate);
      expect(bigger.scaleResolutionDownBy).toBeGreaterThanOrEqual(
        smaller.scaleResolutionDownBy,
      );
      expect(bigger.maxFramerate).toBeLessThanOrEqual(smaller.maxFramerate);
    }
  });

  it('состав уменьшился — качество вернулось', () => {
    // Ради этого пересчёт висит и на выходе участника, а не только на входе.
    const three = groupVideoEncoding('wifi', 3);
    const backToTwo = groupVideoEncoding('wifi', 2);
    expect(backToTwo.maxBitrate).toBeGreaterThan(three.maxBitrate);
  });
});

describe('сеть учитывается вместе с составом', () => {
  it('сотовая сеть ужимает сильнее Wi-Fi при том же составе', () => {
    expect(groupVideoEncoding('cellular', 3).maxBitrate).toBeLessThan(
      groupVideoEncoding('wifi', 3).maxBitrate,
    );
    expect(groupVideoEncoding('cellular', 3).scaleResolutionDownBy).toBeGreaterThan(
      groupVideoEncoding('wifi', 3).scaleResolutionDownBy,
    );
  });

  it('неизвестный транспорт считается узким, как и у звонка один на один', () => {
    expect(groupVideoEncoding(null, 3)).toEqual(
      groupVideoEncoding('cellular', 3),
    );
  });

  it('до каши картинку не ужимаем даже вчетвером по сотовой', () => {
    expect(groupVideoEncoding('cellular', 4).maxBitrate).toBeGreaterThanOrEqual(
      MIN_GROUP_VIDEO_BITRATE,
    );
  });
});

describe('вырожденные составы', () => {
  it('один в комнате — параметры пары, а не «делить на ноль»', () => {
    expect(groupVideoEncoding('wifi', 1)).toEqual(groupVideoEncoding('wifi', 2));
    expect(groupVideoEncoding('wifi', 0)).toEqual(groupVideoEncoding('wifi', 2));
  });

  it('состав больше потолка комнаты падает в самый жёсткий шаг', () => {
    expect(groupVideoEncoding('wifi', 9)).toEqual(groupVideoEncoding('wifi', 4));
  });

  it('мусор вместо числа не даёт undefined в параметрах кодера', () => {
    const encoding = groupVideoEncoding('wifi', Number.NaN);
    expect(Number.isFinite(encoding.maxBitrate)).toBe(true);
    expect(Number.isFinite(encoding.scaleResolutionDownBy)).toBe(true);
  });
});

describe('лишние вызовы нативного моста', () => {
  it('то же качество второй раз не применяется', () => {
    const current = groupVideoEncoding('wifi', 3);
    expect(encodingChanged(current, groupVideoEncoding('wifi', 3))).toBe(false);
  });

  it('первое применение проходит всегда', () => {
    expect(encodingChanged(null, groupVideoEncoding('wifi', 3))).toBe(true);
  });

  it('смена состава применяется', () => {
    expect(
      encodingChanged(groupVideoEncoding('wifi', 2), groupVideoEncoding('wifi', 3)),
    ).toBe(true);
  });
});
