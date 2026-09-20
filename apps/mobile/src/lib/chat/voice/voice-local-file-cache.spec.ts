import {
  canonicalVoiceUrlKey,
  getLocalVoiceFile,
  forgetLocalVoiceFile,
  planVoiceCacheEviction,
  registerLocalVoiceFile,
  resetVoiceLocalFileCacheForTests,
  type VoiceCacheEntry,
  type VoiceCachePolicy,
} from './voice-local-file-cache';

describe('canonicalVoiceUrlKey', () => {
  it('обрезает подписанный query — сырой и подписанный адрес совпадают', () => {
    const raw = 'https://s3.example/bucket/chat/c1/abc.m4a';
    const signed = 'https://s3.example/bucket/chat/c1/abc.m4a?X-Amz-Signature=deadbeef&X-Amz-Expires=21600';
    expect(canonicalVoiceUrlKey(signed)).toBe(canonicalVoiceUrlKey(raw));
    expect(canonicalVoiceUrlKey(raw)).toBe(raw);
  });

  it('обрезает хэш', () => {
    expect(canonicalVoiceUrlKey('https://s3.example/x.m4a#t=3')).toBe('https://s3.example/x.m4a');
  });

  it('пусто/undefined/null — null', () => {
    expect(canonicalVoiceUrlKey(undefined)).toBeNull();
    expect(canonicalVoiceUrlKey(null)).toBeNull();
    expect(canonicalVoiceUrlKey('')).toBeNull();
  });
});

describe('planVoiceCacheEviction', () => {
  const policy: VoiceCachePolicy = { maxEntries: 2, maxTotalBytes: 1000, maxAgeMs: 100 };
  const entry = (key: string, sizeBytes: number, createdAt: number): VoiceCacheEntry => ({ key, localUri: `file://${key}`, sizeBytes, createdAt });

  it('в пределах всех лимитов — никто не вытесняется', () => {
    const entries = [entry('a', 100, 10), entry('b', 100, 20)];
    expect(planVoiceCacheEviction(entries, policy, 30)).toEqual([]);
  });

  it('превышен возраст — вытесняется независимо от остальных лимитов', () => {
    const entries = [entry('a', 100, 0)];
    expect(planVoiceCacheEviction(entries, policy, 200)).toEqual(['a']);
  });

  it('превышено число записей — вытесняются старейшие первыми', () => {
    const entries = [entry('a', 10, 10), entry('b', 10, 20), entry('c', 10, 30)];
    expect(planVoiceCacheEviction(entries, policy, 30)).toEqual(['a']);
  });

  it('превышен суммарный размер — вытесняются старейшие, пока не влезет', () => {
    const bigPolicy: VoiceCachePolicy = { maxEntries: 10, maxTotalBytes: 150, maxAgeMs: 100_000 };
    const entries = [entry('a', 100, 10), entry('b', 100, 20)];
    expect(planVoiceCacheEviction(entries, bigPolicy, 30)).toEqual(['a']);
  });

  it('пустой список — ничего не вытесняется', () => {
    expect(planVoiceCacheEviction([], policy, 0)).toEqual([]);
  });
});

describe('registerLocalVoiceFile / getLocalVoiceFile', () => {
  afterEach(() => resetVoiceLocalFileCacheForTests());

  it('сохранённый файл находится по подписанной ссылке с тем же путём', () => {
    registerLocalVoiceFile('https://s3.example/bucket/chat/c1/v.m4a', 'file:///tmp/v.m4a', 1000, 0);
    expect(getLocalVoiceFile('https://s3.example/bucket/chat/c1/v.m4a?X-Amz-Signature=abc')).toBe('file:///tmp/v.m4a');
  });

  it('нет записи — null, без исключений', () => {
    expect(getLocalVoiceFile('https://s3.example/unknown.m4a')).toBeNull();
    expect(getLocalVoiceFile(undefined)).toBeNull();
  });

  it('forgetLocalVoiceFile убирает мёртвую запись', () => {
    registerLocalVoiceFile('https://s3.example/v.m4a', 'file:///tmp/v.m4a', 1000, 0);
    forgetLocalVoiceFile('https://s3.example/v.m4a');
    expect(getLocalVoiceFile('https://s3.example/v.m4a')).toBeNull();
  });

  it('превышение лимита числа записей вытесняет старейшую и возвращает её вызывающей стороне', () => {
    const now = 0;
    for (let i = 0; i < 40; i += 1) {
      registerLocalVoiceFile(`https://s3.example/v${i}.m4a`, `file:///tmp/v${i}.m4a`, 100, now + i);
    }
    expect(getLocalVoiceFile('https://s3.example/v0.m4a')).toBe('file:///tmp/v0.m4a');
    const evicted = registerLocalVoiceFile('https://s3.example/v40.m4a', 'file:///tmp/v40.m4a', 100, now + 40);
    expect(evicted).toHaveLength(1);
    expect(evicted[0].key).toBe('https://s3.example/v0.m4a');
    expect(getLocalVoiceFile('https://s3.example/v0.m4a')).toBeNull();
    expect(getLocalVoiceFile('https://s3.example/v40.m4a')).toBe('file:///tmp/v40.m4a');
  });
});
