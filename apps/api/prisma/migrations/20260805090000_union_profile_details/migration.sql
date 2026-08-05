-- CreateEnum
CREATE TYPE "public"."UnionDiet" AS ENUM ('vegetarian', 'vegan', 'prasadam_only', 'transitioning', 'not_vegetarian');

-- CreateEnum
CREATE TYPE "public"."UnionRegulativePrinciple" AS ENUM ('no_meat', 'no_intoxicants', 'no_gambling', 'no_illicit_sex');

-- CreateEnum
CREATE TYPE "public"."UnionChildrenStatus" AS ENUM ('none_want', 'none_not_want', 'none_undecided', 'have_living_with', 'have_living_apart');

-- CreateEnum
CREATE TYPE "public"."UnionEducationLevel" AS ENUM ('school', 'vocational', 'incomplete_higher', 'higher', 'academic_degree');

-- CreateEnum
CREATE TYPE "public"."UnionSpiritualEducation" AS ENUM ('none', 'temple_courses', 'bhakti_shastri', 'bhakti_vaibhava', 'bhakti_vedanta', 'other');

-- CreateEnum
CREATE TYPE "public"."UnionHousing" AS ENUM ('own_place', 'rent', 'with_parents', 'with_relatives', 'community', 'temple_ashram');

-- CreateEnum
CREATE TYPE "public"."UnionIncomeLevel" AS ENUM ('basic_needs_hard', 'basic_needs', 'basic_and_rest', 'comfortable', 'prefer_not_say');

-- AlterTable
ALTER TABLE "public"."UnionProfile"
  ADD COLUMN "status" TEXT,
  ADD COLUMN "heightCm" INTEGER,
  ADD COLUMN "diet" "public"."UnionDiet",
  ADD COLUMN "regulativePrinciples" "public"."UnionRegulativePrinciple"[] DEFAULT ARRAY[]::"public"."UnionRegulativePrinciple"[],
  ADD COLUMN "childrenStatus" "public"."UnionChildrenStatus",
  ADD COLUMN "education" "public"."UnionEducationLevel",
  ADD COLUMN "spiritualEducation" "public"."UnionSpiritualEducation",
  ADD COLUMN "housing" "public"."UnionHousing",
  ADD COLUMN "income" "public"."UnionIncomeLevel",
  ADD COLUMN "pets" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "ageRangeMin" INTEGER,
  ADD COLUMN "ageRangeMax" INTEGER;
