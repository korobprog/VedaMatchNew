-- Индексы под периодическую чистку RefreshToken (RefreshTokenCleanupService).
CREATE INDEX "RefreshToken_expiresAt_idx" ON "public"."RefreshToken"("expiresAt");
CREATE INDEX "RefreshToken_revoked_createdAt_idx" ON "public"."RefreshToken"("revoked", "createdAt");
