import { describe, expect, it } from "vitest";
import {
  encodingChanged,
  groupVideoEncoding,
  MIN_GROUP_VIDEO_BITRATE,
  withVideoEncoding,
} from "./group-video-quality";

/**
 * Пересчёт качества при изменении состава — отдельная цель задачи: он не
 * даёт браузеру гнать три потока по мегабиту и он же обязан ВЕРНУТЬ
 * картинку, когда собеседники разошлись.
 */

describe("качество падает с ростом комнаты", () => {
  it("втроём битрейт ниже, чем вдвоём", () => {
    expect(groupVideoEncoding(3).maxBitrate).toBeLessThan(
      groupVideoEncoding(2).maxBitrate,
    );
  });

  it("вчетвером ниже, чем втроём", () => {
    expect(groupVideoEncoding(4).maxBitrate).toBeLessThan(
      groupVideoEncoding(3).maxBitrate,
    );
  });

  it("битрейт не растёт ни на одном шаге, сторона кадра не уменьшается", () => {
    for (let n = 2; n < 5; n += 1) {
      const smaller = groupVideoEncoding(n);
      const bigger = groupVideoEncoding(n + 1);
      expect(bigger.maxBitrate).toBeLessThanOrEqual(smaller.maxBitrate);
      expect(bigger.scaleResolutionDownBy).toBeGreaterThanOrEqual(
        smaller.scaleResolutionDownBy,
      );
      expect(bigger.maxFramerate).toBeLessThanOrEqual(smaller.maxFramerate);
    }
  });

  it("состав уменьшился — качество вернулось", () => {
    expect(groupVideoEncoding(2).maxBitrate).toBeGreaterThan(
      groupVideoEncoding(3).maxBitrate,
    );
  });

  it("до каши картинку не ужимаем даже вчетвером", () => {
    expect(groupVideoEncoding(4).maxBitrate).toBeGreaterThanOrEqual(
      MIN_GROUP_VIDEO_BITRATE,
    );
  });
});

describe("лестница совпадает с приложением", () => {
  it("втроём — половина битрейта и сторона в полтора раза", () => {
    expect(groupVideoEncoding(3)).toEqual({
      maxBitrate: 600_000,
      maxFramerate: 24,
      scaleResolutionDownBy: 1.5,
    });
  });

  it("вчетвером — треть битрейта, сторона вдвое, 20 кадров", () => {
    expect(groupVideoEncoding(4)).toEqual({
      maxBitrate: 400_000,
      maxFramerate: 20,
      scaleResolutionDownBy: 2,
    });
  });
});

describe("вырожденные составы", () => {
  it("один в комнате — параметры пары, а не «делить на ноль»", () => {
    expect(groupVideoEncoding(1)).toEqual(groupVideoEncoding(2));
    expect(groupVideoEncoding(0)).toEqual(groupVideoEncoding(2));
  });

  it("состав больше потолка комнаты падает в самый жёсткий шаг", () => {
    expect(groupVideoEncoding(9)).toEqual(groupVideoEncoding(4));
  });

  it("мусор вместо числа не даёт undefined в параметрах кодера", () => {
    const encoding = groupVideoEncoding(Number.NaN);
    expect(Number.isFinite(encoding.maxBitrate)).toBe(true);
    expect(Number.isFinite(encoding.scaleResolutionDownBy)).toBe(true);
  });
});

describe("лишние вызовы setParameters", () => {
  it("то же качество второй раз не применяется", () => {
    expect(encodingChanged(groupVideoEncoding(3), groupVideoEncoding(3))).toBe(
      false,
    );
  });

  it("первое применение проходит всегда", () => {
    expect(encodingChanged(null, groupVideoEncoding(3))).toBe(true);
  });

  it("смена состава применяется", () => {
    expect(encodingChanged(groupVideoEncoding(2), groupVideoEncoding(3))).toBe(
      true,
    );
  });
});

describe("наложение потолка на параметры отправителя", () => {
  const target = groupVideoEncoding(3);

  it("чужие поля сохраняются дословно — иначе setParameters отвергнет", () => {
    const params = {
      transactionId: "tx-1",
      encodings: [{ rid: "hi", active: true }],
    } as unknown as RTCRtpSendParameters;
    const next = withVideoEncoding(params, target)!;
    expect(next.transactionId).toBe("tx-1");
    expect(next.encodings[0]).toMatchObject({ rid: "hi", active: true });
    expect(next.encodings[0].maxBitrate).toBe(target.maxBitrate);
  });

  it("уже выставленный потолок повторно не накладывается", () => {
    const params = {
      degradationPreference: "balanced",
      encodings: [{ ...target }],
    } as unknown as RTCRtpSendParameters;
    expect(withVideoEncoding(params, target)).toBeNull();
  });

  it("пустой encodings — накладывать не на что, а не выдумать свой", () => {
    const params = { encodings: [] } as unknown as RTCRtpSendParameters;
    expect(withVideoEncoding(params, target)).toBeNull();
  });
});
