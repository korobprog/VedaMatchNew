import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isPortalStaff,
  resolveDisplayName,
  type WorkContactDto,
  type WorkContactsDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalAccessService } from '../access/access.service';
import {
  PORTAL_SEARCH_MIN,
  likeNeedle,
  matchesContactQuery,
} from './work-contacts-search';
import { assertWorkAccess } from './work-roles';
import { WorkSpacesService } from './work-spaces.service';

/** Что нужно от человека, чтобы показать его строкой в приглашении. */
interface Candidate {
  id: string;
  name: string;
  spiritualName: string | null;
  avatarUrl: string | null;
}

/**
 * Кого можно позвать в рабочую среду.
 *
 * Обычному человеку — только знакомых, и источник знакомства — портальный граф
 * доступа (`PortalAccessService`), а не справочник людей «Общения»: чужие
 * таблицы сервису читать нельзя, а граф — портальная инфраструктура, ради
 * этого и заведённая. Берутся обе стороны: и те, кому человек открылся, и те,
 * кто открылся ему. Одностороннего знакомства достаточно, чтобы позвать в
 * проект — приглашение всё равно нужно принять.
 *
 * Администрации портала — весь портал. Это не послабление, а то же правило,
 * что и везде: `isPortalStaff` делает такой аккаунт «другом всех», и
 * `canSeeActivity` уже отвечает «видит» про любого человека. Пока поиск
 * спрашивал только граф, админ видел здесь одних своих личных знакомых и не
 * мог позвать того, кого на портале и так видит целиком.
 *
 * Наружу в обоих случаях едут только имя и аватар — то, что спрашивающий и
 * так видит в карточке человека.
 */
@Injectable()
export class WorkContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortalAccessService,
    private readonly spaces: WorkSpacesService,
  ) {}

  /** Сколько человек показываем: это список для приглашения, а не выдача. */
  private static readonly LIMIT = 50;

  async listFor(
    spaceId: string,
    userId: string,
    query?: string,
  ): Promise<WorkContactsDto> {
    assertWorkAccess(
      await this.spaces.roleOf(spaceId, userId),
      'manageMembers',
    );

    const viewer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const search = query?.trim() ?? '';

    if (isPortalStaff(viewer?.role)) {
      return {
        scope: 'portal',
        items: await this.mark(
          spaceId,
          await this.portal(spaceId, userId, search),
        ),
        minQuery: PORTAL_SEARCH_MIN,
      };
    }

    return {
      scope: 'known',
      items: await this.mark(
        spaceId,
        await this.known(spaceId, userId, search),
      ),
      minQuery: null,
    };
  }

  /**
   * Знакомые спрашивающего, кроме тех, кто уже в среде: позвать их второй раз
   * нельзя, а строка «уже здесь» в списке приглашения — просто шум.
   */
  private async known(
    spaceId: string,
    userId: string,
    search: string,
  ): Promise<Candidate[]> {
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

    const members = await this.prisma.workSpaceMember.findMany({
      where: { spaceId, userId: { in: [...known] } },
      select: { userId: true },
    });
    for (const member of members) known.delete(member.userId);
    if (known.size === 0) return [];

    // Запрос сравниваем в памяти, а не в `where`: базе не объяснить, что ё и
    // е — одна буква. Кандидаты уже ограничены графом знакомств, так что
    // читать их целиком не дорого.
    const people = await this.prisma.user.findMany({
      where: { id: { in: [...known] }, accountStatus: 'active' },
      select: { id: true, name: true, spiritualName: true, avatarUrl: true },
    });
    return people.filter((person) => matchesContactQuery(person, search));
  }

  /**
   * Весь портал — для администрации.
   *
   * Здесь в памяти не отфильтруешь: людей на портале сколько угодно, и
   * вычитывать их всех ради одного имени нельзя. Поэтому то же правило про ё
   * выражено в SQL через `translate`, а отбор, отсев уже состоящих в среде и
   * ограничение выдачи делает база. Без запроса не ищем совсем: перечислять
   * портал в списке приглашения незачем.
   */
  private async portal(
    spaceId: string,
    userId: string,
    search: string,
  ): Promise<Candidate[]> {
    const needle = likeNeedle(search);
    if (!needle) return [];

    return this.prisma.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT u."id", u."name", u."spiritualName", u."avatarUrl"
      FROM "User" u
      WHERE u."accountStatus" = 'active'
        AND u."id" <> ${userId}
        AND NOT EXISTS (
          SELECT 1 FROM "WorkSpaceMember" m
          WHERE m."spaceId" = ${spaceId} AND m."userId" = u."id"
        )
        AND (
          translate(lower(u."name"), 'ё', 'е') LIKE ${needle} ESCAPE '\\'
          OR translate(lower(coalesce(u."spiritualName", '')), 'ё', 'е')
             LIKE ${needle} ESCAPE '\\'
        )
      ORDER BY u."name" ASC
      LIMIT ${WorkContactsService.LIMIT}
    `);
  }

  /**
   * Уже позванных показываем, но помечаем: иначе человек шлёт второе
   * приглашение и не понимает, почему ничего не изменилось.
   */
  private async mark(
    spaceId: string,
    people: Candidate[],
  ): Promise<WorkContactDto[]> {
    if (people.length === 0) return [];

    const invited = await this.prisma.workInvite.findMany({
      where: {
        spaceId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        inviteeId: { in: people.map((person) => person.id) },
      },
      select: { inviteeId: true },
    });
    const invitedIds = new Set(
      invited
        .map((row) => row.inviteeId)
        .filter((id): id is string => Boolean(id)),
    );

    return people
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
