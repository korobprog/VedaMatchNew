import { Injectable } from '@nestjs/common';
import { resolveDisplayName, type WorkContactDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalAccessService } from '../access/access.service';
import { matchesContactQuery } from './work-contacts-search';
import { assertWorkAccess } from './work-roles';
import { WorkSpacesService } from './work-spaces.service';

/**
 * Кого можно позвать в рабочую среду.
 *
 * Источник — портальный граф доступа (`PortalAccessService`), а не справочник
 * людей «Общения»: чужие таблицы сервису читать нельзя, а граф — портальная
 * инфраструктура, ради этого и заведённая. Берутся обе стороны: и те, кому
 * человек открылся, и те, кто открылся ему. Одностороннего знакомства
 * достаточно, чтобы позвать в проект — приглашение всё равно нужно принять.
 *
 * Наружу едут только имя и аватар, и только для тех, кого спрашивающий и так
 * видит. Полного справочника портала здесь нет и не будет: «Работа» не место,
 * где ищут незнакомых.
 */
@Injectable()
export class WorkContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortalAccessService,
    private readonly spaces: WorkSpacesService,
  ) {}

  /** Сколько человек показываем: это список знакомых, а не поисковая выдача. */
  private static readonly LIMIT = 50;

  async listFor(
    spaceId: string,
    userId: string,
    query?: string,
  ): Promise<WorkContactDto[]> {
    assertWorkAccess(
      await this.spaces.roleOf(spaceId, userId),
      'manageMembers',
    );

    const [granters, grantees] = await Promise.all([
      this.access.grantersFor(userId),
      this.access.granteesOf(userId),
    ]);
    const known = new Set([
      ...granters.map((row) => row.granterId),
      ...grantees.map((row) => row.granteeId),
    ]);
    known.delete(userId);
    if (known.size === 0) return [];

    // Уже состоящих в среде не предлагаем: позвать их второй раз нельзя, а
    // строка «уже здесь» в списке приглашения — просто шум.
    const members = await this.prisma.workSpaceMember.findMany({
      where: { spaceId, userId: { in: [...known] } },
      select: { userId: true },
    });
    for (const member of members) known.delete(member.userId);
    if (known.size === 0) return [];

    // Уже позванных показываем, но помечаем: иначе человек шлёт второе
    // приглашение и не понимает, почему ничего не изменилось.
    const invited = await this.prisma.workInvite.findMany({
      where: {
        spaceId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        inviteeId: { in: [...known] },
      },
      select: { inviteeId: true },
    });
    const invitedIds = new Set(
      invited
        .map((row) => row.inviteeId)
        .filter((id): id is string => Boolean(id)),
    );

    // Запрос сравниваем в памяти, а не в `where`: базе не объяснить, что ё и
    // е — одна буква, а без этого «артем» не находит «Артёма». Кандидаты уже
    // ограничены графом знакомств, так что читать их целиком не дорого.
    const search = query?.trim() ?? '';
    const people = await this.prisma.user.findMany({
      where: { id: { in: [...known] }, accountStatus: 'active' },
      select: { id: true, name: true, spiritualName: true, avatarUrl: true },
    });

    return people
      .filter((person) => matchesContactQuery(person, search))
      .map((person) => ({
        userId: person.id,
        name: resolveDisplayName(person),
        avatarUrl: person.avatarUrl,
        alreadyInvited: invitedIds.has(person.id),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'))
      .slice(0, WorkContactsService.LIMIT);
  }
}
