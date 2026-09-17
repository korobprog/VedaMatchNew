import { relayedFromStats, type RtcStatsReport } from './relay-stats';

function report(entries: [string, Record<string, unknown>][]): RtcStatsReport {
  return new Map(entries) as unknown as RtcStatsReport;
}

describe('relayedFromStats', () => {
  it('пара через transport.selectedCandidatePairId, кандидат relay — true', () => {
    const stats = report([
      ['t1', { type: 'transport', selectedCandidatePairId: 'pair1' }],
      ['pair1', { type: 'candidate-pair', state: 'succeeded', localCandidateId: 'loc', remoteCandidateId: 'rem' }],
      ['loc', { type: 'local-candidate', candidateType: 'relay' }],
      ['rem', { type: 'remote-candidate', candidateType: 'host' }],
    ]);
    expect(relayedFromStats(stats)).toBe(true);
  });

  it('оба кандидата host — false', () => {
    const stats = report([
      ['t1', { type: 'transport', selectedCandidatePairId: 'pair1' }],
      ['pair1', { type: 'candidate-pair', state: 'succeeded', localCandidateId: 'loc', remoteCandidateId: 'rem' }],
      ['loc', { type: 'local-candidate', candidateType: 'host' }],
      ['rem', { type: 'remote-candidate', candidateType: 'srflx' }],
    ]);
    expect(relayedFromStats(stats)).toBe(false);
  });

  it('пара найдена через candidate-pair.selected, без транспорта', () => {
    const stats = report([
      ['pair1', { type: 'candidate-pair', state: 'succeeded', selected: true, localCandidateId: 'loc', remoteCandidateId: 'rem' }],
      ['loc', { type: 'local-candidate', candidateType: 'relay' }],
      ['rem', { type: 'remote-candidate', candidateType: 'relay' }],
    ]);
    expect(relayedFromStats(stats)).toBe(true);
  });

  it('нет выбранной пары — null', () => {
    expect(relayedFromStats(report([]))).toBeNull();
  });

  it('пара есть, но кандидаты не найдены в отчёте — null', () => {
    const stats = report([
      ['t1', { type: 'transport', selectedCandidatePairId: 'pair1' }],
      ['pair1', { type: 'candidate-pair', state: 'succeeded', localCandidateId: 'missing1', remoteCandidateId: 'missing2' }],
    ]);
    expect(relayedFromStats(stats)).toBeNull();
  });
});
