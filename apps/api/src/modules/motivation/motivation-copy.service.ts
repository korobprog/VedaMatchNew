import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { MotivationAudienceTrack, MotivationProfileType, MotivationTranslationKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationGenerationService, type VerifiedQuoteCopy } from './motivation-generation.service';

const allowedProfiles = new Set<string>(Object.values(MotivationProfileType));
const languages = ['ru', 'en', 'hi'] as const;

@Injectable()
export class MotivationCopyService {
  constructor(private readonly prisma: PrismaService, private readonly generation: MotivationGenerationService) {}

  async prepareCandidate(quoteId: string) {
    const quote = await this.prisma.motivationQuote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException('Verified quote not found');
    if (!quote.verified) throw new BadGatewayException('Quote source is not verified');

    const copy = await this.generation.generateVerifiedQuoteCopy({
      originalText: quote.originalText,
      originalLanguage: quote.originalLanguage,
      author: quote.author,
      work: quote.work,
      locator: quote.locator,
      contextExcerpt: quote.contextExcerpt,
    });
    this.validateCopy(copy, quote.originalText, quote.originalLanguage);

    const profileTypes = [...new Set(copy.profileTypes)] as MotivationProfileType[];
    const profileType = profileTypes[0];
    const contentDate = new Date(new Date().toISOString().slice(0, 10));
    const audienceTrack = quote.sourceType === 'vedamatch_library' ? MotivationAudienceTrack.vaishnava : MotivationAudienceTrack.universal;

    return this.prisma.$transaction(async (transaction) => {
      await transaction.motivationQuoteTranslation.deleteMany({ where: { quoteId } });
      await transaction.motivationQuoteTranslation.createMany({
        data: languages.map((language) => ({
          quoteId,
          language,
          quoteText: language === quote.originalLanguage ? quote.originalText : copy.translations[language].quoteText,
          translationKind: copy.translations[language].translationKind as MotivationTranslationKind,
          label: copy.translations[language].label,
        })),
      });
      await transaction.motivationQuoteProfile.deleteMany({ where: { quoteId } });
      await transaction.motivationQuoteProfile.createMany({ data: profileTypes.map((assignedProfile) => ({ quoteId, profileType: assignedProfile })) });
      return transaction.motivationPost.create({
        data: {
          quoteId,
          contentDate,
          profileType,
          audienceTrack,
          slug: `quote-${quoteId}`,
          category: 'verified_quote',
          status: 'draft',
          reviewStatus: 'text_review',
          sourceVerified: true,
          attributionKind: 'exact_quote',
          attributionSpeaker: quote.author,
          attributionWork: quote.work,
          attributionLocator: quote.locator,
          attributionSourceUrl: quote.sourceUrl,
          generationStage: 'text',
          promptVersion: 'verified-quote-v1',
          imageUrl: null,
          storyImageUrl: null,
          imagePrompt: null,
          translations: {
            create: languages.map((language) => ({
              language,
              title: copy.translations[language].title,
              text: `${copy.translations[language].quoteText}\n\n${copy.translations[language].explanation}`,
              storyText: copy.translations[language].storyText,
            })),
          },
        },
      });
    });
  }

  private validateCopy(copy: VerifiedQuoteCopy, originalText: string, originalLanguage: string) {
    if (!copy || typeof copy !== 'object' || !Array.isArray(copy.profileTypes) || typeof copy.explanation !== 'string' || !copy.translations || typeof copy.translations !== 'object') {
      throw new BadGatewayException('Text provider returned invalid verified quote copy');
    }
    if (copy.originalText !== originalText) throw new BadGatewayException('Text provider returned modified original');
    if (!copy.profileTypes.length || copy.profileTypes.some((profile) => !allowedProfiles.has(profile))) throw new BadGatewayException('Text provider returned unknown profile');
    this.validateExplanation(copy.explanation, 'Explanation');
    for (const language of languages) {
      const translation = copy.translations[language];
      if (!translation || typeof translation !== 'object' || typeof translation.quoteText !== 'string' || typeof translation.title !== 'string' || typeof translation.explanation !== 'string' || typeof translation.storyText !== 'string') throw new BadGatewayException(`Text provider omitted ${language} translation`);
      this.validateExplanation(translation.explanation, `${language} explanation`);
      if (language === originalLanguage) {
        if (translation.quoteText !== originalText) throw new BadGatewayException('Text provider returned modified original translation');
        if (translation.translationKind !== 'official') throw new BadGatewayException('Original translation kind must be official');
      } else if (translation.translationKind !== 'vedamatch') {
        throw new BadGatewayException('AI translation kind must be vedamatch');
      } else if (translation.label !== 'Перевод VedaMatch') {
        throw new BadGatewayException('AI translation label must be Перевод VedaMatch');
      }
    }
  }

  private validateExplanation(explanation: string, field: string) {
    const paragraphs = explanation.split(/\n\s*\n/).filter((paragraph) => paragraph.trim());
    if (explanation.trim().length <= 20 || paragraphs.length < 1 || paragraphs.length > 2) {
      throw new BadGatewayException(`${field} must contain one or two non-empty paragraphs longer than 20 characters`);
    }
  }
}
