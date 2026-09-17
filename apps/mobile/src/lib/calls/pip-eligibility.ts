import type { ChatCallKind } from '@vedamatch/shared';
import type { CallPhase } from './call-machine';

/**
 * Картинка в картинке (VED-222, п.5) — только видеозвонок, только пока
 * разговор реально идёт и экран звонка (`app/call/[id].tsx`) смонтирован:
 * дозвон (`outgoing`/`connecting`/`incoming`) ещё нечего показывать в PiP
 * (удалённого видео нет), а свёрнутый заранее «назад» звонок
 * (`call-screen-return.ts`) не должен внезапно всплывать окошком, когда
 * человек и так уже ушёл из экрана сознательно.
 */
export function isPipEligible(kind: ChatCallKind, phase: CallPhase, screenVisible: boolean): boolean {
  return kind === 'video' && phase === 'active' && screenVisible;
}
