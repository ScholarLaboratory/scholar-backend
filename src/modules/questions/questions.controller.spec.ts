import { Test } from '@nestjs/testing';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

describe('QuestionsController', () => {
  it('delegates subject retrieval to its service', async () => {
    const subjects = [{ id: 'subject-1', name: 'Mathematics' }];
    const questionsService = { getSubjects: jest.fn().mockResolvedValue(subjects) };
    const module = await Test.createTestingModule({
      controllers: [QuestionsController],
      providers: [{ provide: QuestionsService, useValue: questionsService }],
    }).compile();
    const controller = module.get(QuestionsController);
    await expect(controller.getSubjects()).resolves.toEqual(subjects);
    expect(questionsService.getSubjects).toHaveBeenCalledTimes(1);
  });
});
