import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = moduleRef.get<AppController>(AppController);
  });

  describe('health', () => {
    it('returns api health payload', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        service: 'api',
      });
    });
  });
});
