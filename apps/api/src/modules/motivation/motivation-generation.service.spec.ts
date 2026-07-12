import { ConfigService } from '@nestjs/config';
import { MotivationGenerationService } from './motivation-generation.service';

describe('MotivationGenerationService', () => {
  it('rejects image models as controller models', async () => {
    const config = { get: (key: string) => ({ MOTIVATION_AI_API_KEY: 'test', MOTIVATION_AI_BASE_URL: 'https://example.test/v1', MOTIVATION_IMAGE_CONTROLLER_MODEL: 'gpt-image-1' })[key] } as ConfigService;
    const service = new MotivationGenerationService(config);
    await expect(service.generateImage('test')).rejects.toThrow('Responses-capable');
  });
});
