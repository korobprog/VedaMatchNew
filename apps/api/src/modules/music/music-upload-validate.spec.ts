import {
  MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES,
  MUSIC_UPLOAD_DEFAULT_LIMITS,
  MUSIC_UPLOAD_REJECTION_TEXT,
  validateMusicIngestRequest,
  validateMusicUploadCompletion,
  validateMusicUploadRequest,
} from './music-upload-validate';
import type { MusicUploadLimits } from './music-upload-validate';

const limits: MusicUploadLimits = {
  maxBytes: 1000,
  maxDurationSeconds: 600,
  maxBitrateKbps: 320,
  accountQuotaBytes: 5000,
};

const request = (over: Record<string, unknown> = {}) => ({
  mime: 'audio/mpeg',
  sizeBytes: 500,
  rightsBasis: 'own_recording' as const,
  usedBytes: 0,
  ...over,
});

describe('validateMusicUploadRequest', () => {
  it('пропускает обычную заявку', () => {
    expect(validateMusicUploadRequest(request(), limits)).toBeNull();
  });

  describe('формат', () => {
    it('принимает mp3 и m4a', () => {
      expect(
        validateMusicUploadRequest(request({ mime: 'audio/mpeg' }), limits),
      ).toBeNull();
      expect(
        validateMusicUploadRequest(request({ mime: 'audio/mp4' }), limits),
      ).toBeNull();
    });

    it('отклоняет то, что играет не везде', () => {
      for (const mime of ['audio/flac', 'audio/wav', 'audio/ogg']) {
        expect(validateMusicUploadRequest(request({ mime }), limits)).toBe(
          'mime_not_accepted',
        );
      }
    });

    it('не спотыкается о параметры типа и регистр', () => {
      expect(
        validateMusicUploadRequest(
          request({ mime: 'AUDIO/MPEG; codecs="mp3"' }),
          limits,
        ),
      ).toBeNull();
    });

    it('пустой тип — отказ, а не пропуск', () => {
      expect(validateMusicUploadRequest(request({ mime: '' }), limits)).toBe(
        'mime_not_accepted',
      );
    });
  });

  describe('размер', () => {
    it('ноль и отрицательное считает пустым файлом', () => {
      expect(
        validateMusicUploadRequest(request({ sizeBytes: 0 }), limits),
      ).toBe('file_empty');
      expect(
        validateMusicUploadRequest(request({ sizeBytes: -1 }), limits),
      ).toBe('file_empty');
    });

    it('не пропускает больше потолка', () => {
      expect(
        validateMusicUploadRequest(request({ sizeBytes: 1001 }), limits),
      ).toBe('file_too_large');
    });

    it('ровно потолок — пропускает', () => {
      expect(
        validateMusicUploadRequest(request({ sizeBytes: 1000 }), limits),
      ).toBeNull();
    });
  });

  it('без основания прав ссылку не выдаёт', () => {
    expect(
      validateMusicUploadRequest(request({ rightsBasis: null }), limits),
    ).toBe('rights_basis_required');
    expect(
      validateMusicUploadRequest(request({ rightsBasis: undefined }), limits),
    ).toBe('rights_basis_required');
  });

  describe('квота', () => {
    it('считает уже занятое вместе с новым файлом', () => {
      expect(
        validateMusicUploadRequest(
          request({ usedBytes: 4600, sizeBytes: 500 }),
          limits,
        ),
      ).toBe('quota_exceeded');
    });

    it('впритык укладывается', () => {
      expect(
        validateMusicUploadRequest(
          request({ usedBytes: 4500, sizeBytes: 500 }),
          limits,
        ),
      ).toBeNull();
    });
  });

  it('без переданных пределов берёт значения по умолчанию', () => {
    expect(
      validateMusicUploadRequest(
        request({ sizeBytes: MUSIC_UPLOAD_DEFAULT_LIMITS.maxBytes + 1 }),
      ),
    ).toBe('file_too_large');
  });
});

const completion = (over: Record<string, unknown> = {}) => ({
  sizeBytes: 500,
  durationSeconds: 180,
  bitrateKbps: 192,
  duplicate: false,
  ...over,
});

describe('validateMusicUploadCompletion', () => {
  it('пропускает залитый файл', () => {
    expect(validateMusicUploadCompletion(completion(), limits)).toBeNull();
  });

  it('недокачанный объект отклоняет', () => {
    expect(
      validateMusicUploadCompletion(completion({ sizeBytes: 0 }), limits),
    ).toBe('file_empty');
  });

  it('обещанный размер не спасает: считаем по факту', () => {
    expect(
      validateMusicUploadCompletion(completion({ sizeBytes: 5000 }), limits),
    ).toBe('file_too_large');
  });

  describe('длительность', () => {
    it('без неё запись не заводится', () => {
      expect(
        validateMusicUploadCompletion(
          completion({ durationSeconds: null }),
          limits,
        ),
      ).toBe('duration_unknown');
      expect(
        validateMusicUploadCompletion(
          completion({ durationSeconds: 0 }),
          limits,
        ),
      ).toBe('duration_unknown');
    });

    it('слишком длинную отклоняет', () => {
      expect(
        validateMusicUploadCompletion(
          completion({ durationSeconds: 601 }),
          limits,
        ),
      ).toBe('duration_too_long');
    });
  });

  describe('битрейт', () => {
    it('выше потолка — отказ', () => {
      expect(
        validateMusicUploadCompletion(completion({ bitrateKbps: 321 }), limits),
      ).toBe('bitrate_too_high');
    });

    it('непрочитанный битрейт не повод отказывать — файл играет и так', () => {
      expect(
        validateMusicUploadCompletion(
          completion({ bitrateKbps: null }),
          limits,
        ),
      ).toBeNull();
    });
  });

  it('дубль по контрольной сумме отклоняет', () => {
    expect(
      validateMusicUploadCompletion(completion({ duplicate: true }), limits),
    ).toBe('duplicate');
  });

  it('размер проверяется раньше дубля — недокачанное не объявляем дублем', () => {
    expect(
      validateMusicUploadCompletion(
        completion({ sizeBytes: 0, duplicate: true }),
        limits,
      ),
    ).toBe('file_empty');
  });
});

describe('MUSIC_UPLOAD_REJECTION_TEXT', () => {
  it('у каждой причины есть текст для человека', () => {
    const rejections = [
      validateMusicUploadRequest(request({ mime: 'audio/flac' }), limits),
      validateMusicUploadRequest(request({ sizeBytes: 0 }), limits),
      validateMusicUploadRequest(request({ sizeBytes: 1001 }), limits),
      validateMusicUploadRequest(request({ rightsBasis: null }), limits),
      validateMusicUploadRequest(request({ usedBytes: 4999 }), limits),
      validateMusicUploadCompletion(
        completion({ durationSeconds: null }),
        limits,
      ),
      validateMusicUploadCompletion(
        completion({ durationSeconds: 601 }),
        limits,
      ),
      validateMusicUploadCompletion(completion({ bitrateKbps: 321 }), limits),
      validateMusicUploadCompletion(completion({ duplicate: true }), limits),
    ];

    for (const rejection of rejections) {
      expect(rejection).not.toBeNull();
      expect(MUSIC_UPLOAD_REJECTION_TEXT[rejection!]).toBeTruthy();
    }
  });
});

describe('validateMusicIngestRequest', () => {
  const facts = {
    mime: 'audio/mpeg',
    sizeBytes: 10 * 1024 * 1024,
    batchUsedBytes: 0,
  };

  it('пропускает обычный файл', () => {
    expect(validateMusicIngestRequest(facts)).toBeNull();
  });

  it('не спрашивает основание прав у позиции: оно задано на партии', () => {
    // Личная загрузка на тех же фактах откажет — основание прав у неё
    // обязательное. У редакции оно одно на всю партию, и требовать его с
    // каждой дорожки незачем; сравнение двух проверок это и фиксирует.
    expect(
      validateMusicUploadRequest({
        mime: facts.mime,
        sizeBytes: facts.sizeBytes,
        rightsBasis: null,
        usedBytes: 0,
      }),
    ).toBe('rights_basis_required');
    expect(validateMusicIngestRequest(facts)).toBeNull();
  });

  it('держит те же пределы по типу и размеру, что и личная загрузка', () => {
    expect(validateMusicIngestRequest({ ...facts, mime: 'audio/flac' })).toBe(
      'mime_not_accepted',
    );
    expect(
      validateMusicIngestRequest({ ...facts, sizeBytes: 200 * 1024 * 1024 }),
    ).toBe('file_too_large');
    expect(validateMusicIngestRequest({ ...facts, sizeBytes: 0 })).toBe(
      'file_empty',
    );
  });

  it('считает потолок партии, а не личную квоту', () => {
    expect(
      validateMusicIngestRequest({
        ...facts,
        batchUsedBytes: MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES,
      }),
    ).toBe('batch_quota_exceeded');
  });

  it('пускает файл, ровно укладывающийся в остаток партии', () => {
    expect(
      validateMusicIngestRequest({
        ...facts,
        batchUsedBytes: MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES - facts.sizeBytes,
      }),
    ).toBeNull();
  });
});
