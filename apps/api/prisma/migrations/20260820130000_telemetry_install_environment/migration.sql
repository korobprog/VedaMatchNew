-- CreateEnum
CREATE TYPE "public"."TelemetryPwaBrowser" AS ENUM ('chrome', 'samsung', 'yandex_browser', 'yandex_app', 'safari', 'firefox', 'edge', 'opera', 'other');

-- CreateEnum
CREATE TYPE "public"."TelemetryPwaPlatform" AS ENUM ('android', 'ios', 'desktop');

-- CreateEnum
CREATE TYPE "public"."TelemetryPwaDisplayMode" AS ENUM ('fullscreen', 'standalone', 'minimal_ui', 'browser');

-- CreateTable
CREATE TABLE "public"."TelemetryInstallEnvironment" (
    "userId" TEXT NOT NULL,
    "browser" "public"."TelemetryPwaBrowser" NOT NULL,
    "platform" "public"."TelemetryPwaPlatform" NOT NULL,
    "displayMode" "public"."TelemetryPwaDisplayMode" NOT NULL,
    "standaloneCapable" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelemetryInstallEnvironment_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "TelemetryInstallEnvironment_browser_displayMode_idx" ON "public"."TelemetryInstallEnvironment"("browser", "displayMode");

-- CreateIndex
CREATE INDEX "TelemetryInstallEnvironment_updatedAt_idx" ON "public"."TelemetryInstallEnvironment"("updatedAt");

-- AddForeignKey
ALTER TABLE "public"."TelemetryInstallEnvironment" ADD CONSTRAINT "TelemetryInstallEnvironment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
