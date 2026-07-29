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
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.profiles.getRecommendations(user.sub, toFilters(query));
  }

  @Get('users/:id')
  userCard(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.profiles.getRecommendationForUser(user.sub, id);
  }
}

function toFilters(
  query: Record<string, string | undefined>,
): UnionRecommendationFilters {
  return {
    intention: query.intention as UnionRecommendationFilters['intention'],
    city: query.city,
    country: query.country,
    lat: toNumber(query.lat),
    lon: toNumber(query.lon),
    radiusKm: toNumber(query.radiusKm),
    stage: query.stage as UnionRecommendationFilters['stage'],
    gender: query.gender as UnionRecommendationFilters['gender'],
    ageMin: toNumber(query.ageMin),
    ageMax: toNumber(query.ageMax),
    verifiedOnly: query.verifiedOnly === 'true' || query.verifiedOnly === '1',
    photoVerifiedOnly:
      query.photoVerifiedOnly === 'true' || query.photoVerifiedOnly === '1',
    format: query.format as UnionRecommendationFilters['format'],
    language: query.language,
    page: toNumber(query.page),
    pageSize: toNumber(query.pageSize),
  };
}

function toNumber(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
