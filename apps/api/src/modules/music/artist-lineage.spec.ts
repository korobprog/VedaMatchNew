import {
  resolveTrackLineage,
  trackLineageWithArtistDefault,
} from './artist-lineage';

describe('trackLineageWithArtistDefault (VED-566)', () => {
  it('явная линия записи сильнее линии исполнителя', () => {
    expect(trackLineageWithArtistDefault('ipbys', 'iskcon')).toBe('ipbys');
  });

  it('линия не выбрана — берётся линия исполнителя', () => {
    expect(trackLineageWithArtistDefault(null, 'iskcon')).toBe('iskcon');
    expect(trackLineageWithArtistDefault(undefined, 'advaita_vamsha')).toBe(
      'advaita_vamsha',
    );
  });

  it('у исполнителя линии нет — запись «для всех», как до VED-566', () => {
    expect(trackLineageWithArtistDefault(null, null)).toBeNull();
  });

  it('строка вне справочника не уезжает в каталог ни с той, ни с другой стороны', () => {
    expect(trackLineageWithArtistDefault('matha', 'iskcon')).toBe('iskcon');
    expect(trackLineageWithArtistDefault(null, 'matha')).toBeNull();
  });
});

describe('resolveTrackLineage (VED-566)', () => {
  it('у партии своя линия — исполнителя не дочитывает', async () => {
    const load = jest.fn();
    await expect(resolveTrackLineage('ipbys', 'a1', load)).resolves.toBe(
      'ipbys',
    );
    expect(load).not.toHaveBeenCalled();
  });

  it('записи без исполнителя — «для всех», без похода в базу', async () => {
    const load = jest.fn();
    await expect(resolveTrackLineage(null, null, load)).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('линии у партии нет — новая запись получает линию исполнителя', async () => {
    const load = jest.fn().mockResolvedValue('sri_chaitanya_saraswat_math');
    await expect(resolveTrackLineage(null, 'a1', load)).resolves.toBe(
      'sri_chaitanya_saraswat_math',
    );
    expect(load).toHaveBeenCalledWith('a1');
  });

  it('исполнитель не найден или без линии — «для всех»', async () => {
    await expect(
      resolveTrackLineage(null, 'a1', () => Promise.resolve(undefined)),
    ).resolves.toBeNull();
    await expect(
      resolveTrackLineage(null, 'a1', () => Promise.resolve(null)),
    ).resolves.toBeNull();
  });
});
