import { MusicCoversService } from './music-covers.service';

const owner = '33e14d6e-ebd9-46e9-99b9-fa206816895b';
const file = '72fb3738-4d1e-4ded-81b6-e5e38f79c3f7.jpg';

function build(options: { configured?: boolean; stream?: unknown } = {}) {
  const { configured = true, stream = { pipe: jest.fn() } } = options;
  const storage = {
    configured,
    getStream: jest.fn().mockResolvedValue(stream),
  };
  return { service: new MusicCoversService(storage as never), storage };
}

describe('MusicCoversService.readCover', () => {
  it('отдаёт поток и тип картинки', async () => {
    const { service, storage } = build();

    const cover = await service.readCover({ scope: 'track', owner, file });

    expect(storage.getStream).toHaveBeenCalledWith(
      `music/covers/track/${owner}/${file}`,
    );
    expect(cover?.contentType).toBe('image/jpeg');
  });

  // Маршрут открыт гостю: путь мимо обложек не должен доходить до хранилища.
  it('чужой путь до хранилища не доходит', async () => {
    const { service, storage } = build();

    expect(await service.readCover({ scope: 'work', owner, file })).toBeNull();
    expect(
      await service.readCover({ scope: 'track', owner, file: '../a.mp3' }),
    ).toBeNull();
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('нет объекта — нет обложки', async () => {
    const { service } = build({ stream: null });

    expect(await service.readCover({ scope: 'track', owner, file })).toBeNull();
  });

  it('хранилище не настроено — тоже нет', async () => {
    const { service, storage } = build({ configured: false });

    expect(await service.readCover({ scope: 'track', owner, file })).toBeNull();
    expect(storage.getStream).not.toHaveBeenCalled();
  });
});
