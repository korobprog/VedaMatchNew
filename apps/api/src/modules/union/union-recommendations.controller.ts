import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  UnionRecommendationFilters,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { UnionProfileService } from './union-profile.service';

@Controller('union')
@UseGuards(AuthGuard)
export class UnionRecommendationsController {
  constructor(private readonly profiles: UnionProfileService) {}

  @Get('recommendations')
  recommendations(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: QueryParams,
  ) {
    return this.profiles.getRecommendations(user.sub, toFilters(query));
  }

  @Get('users/:id')
  userCard(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.profiles.getRecommendationForUser(user.sub, id);
  }
}

function toFilters(query: QueryParams): UnionRecommendationFilters {
  return {
    intention: first(
      query.intention,
    ) as UnionRecommendationFilters['intention'],
    intentions: toIntentions(query.intentions),
    city: first(query.city),
    country: first(query.country),
    lat: toNumber(first(query.lat)),
    lon: toNumber(first(query.lon)),
    radiusKm: toNumber(first(query.radiusKm)),
    stage: first(query.stage) as UnionRecommendationFilters['stage'],
    gender: first(query.gender) as UnionRecommendationFilters['gender'],
    ageMin: toNumber(first(query.ageMin)),
    ageMax: toNumber(first(query.ageMax)),
    verifiedOnly:
      first(query.verifiedOnly) === 'true' || first(query.verifiedOnly) === '1',
    photoVerifiedOnly:
      first(query.photoVerifiedOnly) === 'true' ||
      first(query.photoVerifiedOnly) === '1',
    includeSwiped:
      first(query.includeSwiped) === 'true' || first(query.includeSwiped) === '1',
    format: first(query.format) as UnionRecommendationFilters['format'],
    language: first(query.language),
    diet: first(query.diet) as UnionRecommendationFilters['diet'],
    principlesMin: toNumber(first(query.principlesMin)),
    childrenStatus: first(
      query.childrenStatus,
    ) as UnionRecommendationFilters['childrenStatus'],
    sort: first(query.sort) as UnionRecommendationFilters['sort'],
    minScore: toNumber(first(query.minScore)),
    page: toNumber(first(query.page)),
    pageSize: toNumber(first(query.pageSize)),
  };
}

function toNumber(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

type QueryParams = Record<string, string | string[] | undefined>;

/** Повторяющийся параметр приходит массивом; для всего, кроме целей,
 *  осмысленно только первое значение. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toIntentions(
  value: string | string[] | undefined,
): UnionRecommendationFilters['intentions'] {
  if (value == null) return undefined;
  const list = Array.isArray(value) ? value : [value];
  return list as UnionRecommendationFilters['intentions'];
}
