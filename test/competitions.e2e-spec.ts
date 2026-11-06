import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

describe('Competition flow (PostgreSQL e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tag = randomUUID().slice(0, 8);
  const ids: string[] = [];
  let subjectId: string;
  let topicId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const subject = await prisma.subject.create({ data: { name: 'E2E ' + tag, slug: 'e2e-' + tag } });
    subjectId = subject.id;
    const topic = await prisma.topic.create({
      data: { name: 'Competition integration', slug: 'competition-' + tag, subjectId },
    });
    topicId = topic.id;
    for (let i = 0; i < 2; i++) {
      await prisma.question.create({
        data: {
          questionText: 'Integration question ' + i,
          academicLevel: 'SECONDARY', difficulty: 'BEGINNER',
          source: 'PLATFORM', status: 'PUBLISHED', subjectId, topicId,
          options: { create: [
            { optionText: 'Correct', isCorrect: true },
            { optionText: 'Incorrect', isCorrect: false },
          ] },
        },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.competition.deleteMany({ where: { topicId } });
      await prisma.quizSession.deleteMany({ where: { userId: { in: ids } } });
      await prisma.question.deleteMany({ where: { topicId } });
      await prisma.topic.deleteMany({ where: { id: topicId } });
      await prisma.subject.deleteMany({ where: { id: subjectId } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  async function register(index: number) {
    const email = `scholar-e2e-${tag}-${index}@example.test`;
    const password = 'TestPassword123!';
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ fullName: 'Test Student ' + index, username: `e2e_${tag}_${index}`, email, password })
      .expect(201);
    ids.push(registration.body.data.id);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login').send({ email, password }).expect(201);
    return { id: registration.body.data.id, token: login.body.data.accessToken as string };
  }

  it('registers students, starts synchronized quizzes and publishes results after expiry', async () => {
    const host = await register(1);
    const student = await register(2);
    // A freshly registered student cannot create hosted events or edit the question bank.
    await request(app.getHttpServer()).post('/api/v1/competitions')
      .auth(student.token, { type: 'bearer' })
      .send({ title: 'Unauthorized Cup', topicId, questionCount: 2, durationSeconds: 30 })
      .expect(403);
    await request(app.getHttpServer()).post('/api/v1/subjects')
      .auth(student.token, { type: 'bearer' })
      .send({ name: 'Unauthorized Subject ' + tag })
      .expect(403);
    await request(app.getHttpServer()).post('/api/v1/topics')
      .auth(student.token, { type: 'bearer' })
      .send({ subjectId, name: 'Unauthorized Topic' })
      .expect(403);
    await request(app.getHttpServer()).post('/api/v1/questions')
      .auth(student.token, { type: 'bearer' })
      .send({
        subjectId, topicId, questionText: 'Unauthorized question?',
        academicLevel: 'SECONDARY', difficulty: 'BEGINNER',
        options: [{ optionText: 'A', isCorrect: true }, { optionText: 'B', isCorrect: false }],
      }).expect(403);
    const publishedQuestions = await request(app.getHttpServer())
      .get(`/api/v1/topics/${topicId}/questions`).expect(200);
    expect(publishedQuestions.body).toHaveLength(2);
    for (const question of publishedQuestions.body) {
      expect(question).not.toHaveProperty('explanation');
      for (const option of question.options) {
        expect(option).not.toHaveProperty('isCorrect');
      }
    }
    await prisma.user.update({ where: { id: host.id }, data: { role: 'FACILITATOR' } });
    const created = await request(app.getHttpServer()).post('/api/v1/competitions')
      .auth(host.token, { type: 'bearer' })
      .send({ title: 'Integration Cup', topicId, questionCount: 2, durationSeconds: 30 })
      .expect(201);
    const competitionId = created.body.id as string;

    await request(app.getHttpServer()).post(`/api/v1/competitions/${competitionId}/open`)
      .auth(student.token, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/competitions/${competitionId}/open`)
      .auth(host.token, { type: 'bearer' }).expect(201);
    for (const user of [host, student]) {
      await request(app.getHttpServer()).post(`/api/v1/competitions/${competitionId}/join`)
        .auth(user.token, { type: 'bearer' }).expect(201);
    }
    await request(app.getHttpServer()).post(`/api/v1/competitions/${competitionId}/close`)
      .auth(student.token, { type: 'bearer' }).expect(403);
    const lateStudent = await register(3);
    const [lateJoin, closed] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/competitions/${competitionId}/join`)
        .auth(lateStudent.token, { type: 'bearer' }),
      request(app.getHttpServer()).post(`/api/v1/competitions/${competitionId}/close`)
        .auth(host.token, { type: 'bearer' }),
    ]);
    expect(closed.status).toBe(201);
    expect([201, 409]).toContain(lateJoin.status);
    const roster = await prisma.competitionParticipant.findMany({
      where: { competitionId }, select: { userId: true },
    });
    expect(roster.some((entry) => entry.userId === lateStudent.id)).toBe(lateJoin.status === 201);
    await request(app.getHttpServer()).post(`/api/v1/competitions/${competitionId}/join`)
      .auth(lateStudent.token, { type: 'bearer' }).expect(409);
    await request(app.getHttpServer()).post(`/api/v1/competitions/${competitionId}/start`)
      .auth(student.token, { type: 'bearer' }).expect(403);
    const beforeStart = await request(app.getHttpServer())
      .get(`/api/v1/competitions/${competitionId}/leaderboard`)
      .auth(student.token, { type: 'bearer' }).expect(200);
    expect(beforeStart.body).toMatchObject({
      competitionId, status: 'NOT_STARTED', rankings: [],
    });
    const started = await request(app.getHttpServer()).post(`/api/v1/competitions/${competitionId}/start`)
      .auth(host.token, { type: 'bearer' }).expect(201);
    expect(new Date(started.body.endsAt).getTime() - new Date(started.body.startsAt).getTime())
      .toBeGreaterThanOrEqual(29000);

    const activeBoard = await request(app.getHttpServer())
      .get(`/api/v1/competitions/${competitionId}/leaderboard`)
      .auth(student.token, { type: 'bearer' }).expect(200);
    expect(activeBoard.body).toMatchObject({
      competitionId, status: 'IN_PROGRESS', rankings: [],
    });

    const quizIds: string[] = [];
    const questionSets: string[][] = [];
    for (const user of [host, student]) {
      const assignment = await request(app.getHttpServer())
        .get(`/api/v1/competitions/${competitionId}/my-quiz`)
        .auth(user.token, { type: 'bearer' }).expect(200);
      quizIds.push(assignment.body.quizSessionId);
      const quiz = await request(app.getHttpServer())
        .get(`/api/v1/quizzes/${assignment.body.quizSessionId}`)
        .auth(user.token, { type: 'bearer' }).expect(200);
      questionSets.push(quiz.body.questions.map((question: { id: string }) => question.id));
    }
    expect(questionSets[0]).toEqual(questionSets[1]);
    // Quiz IDs are opaque, but ownership must still be enforced on every route.
    await request(app.getHttpServer())
      .get(`/api/v1/quizzes/${quizIds[0]}`)
      .auth(student.token, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${quizIds[0]}/complete`)
      .auth(student.token, { type: 'bearer' }).expect(403);
    const privateQuestion = await prisma.quizSessionQuestion.findFirstOrThrow({
      where: { sessionId: quizIds[0] }, select: { questionId: true },
    });
    const privateOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: privateQuestion.questionId }, select: { id: true },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${quizIds[0]}/answers`)
      .auth(student.token, { type: 'bearer' })
      .send({ questionId: privateQuestion.questionId, selectedOptionId: privateOption.id })
      .expect(403);


    await prisma.competition.update({
      where: { id: competitionId },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    // Race a finalization attempt against expiry settlement and verify immutable results.
    const submitAfterDeadline = request(app.getHttpServer())
      .post(`/api/v1/quizzes/${quizIds[0]}/complete`)
      .auth(host.token, { type: 'bearer' });
    const settle = request(app.getHttpServer())
      .get(`/api/v1/competitions/${competitionId}/leaderboard`)
      .auth(host.token, { type: 'bearer' });
    const [lateCompletion, settledBoard] = await Promise.all([submitAfterDeadline, settle]);
    expect(lateCompletion.status).toBe(409);
    expect(settledBoard.status).toBe(200);

    const board = await request(app.getHttpServer())
      .get(`/api/v1/competitions/${competitionId}/leaderboard`)
      .auth(host.token, { type: 'bearer' }).expect(200);
    expect(board.body.status).toBe('COMPLETED');
    expect(board.body.rankings.map((entry: { rank: number }) => entry.rank))
      .toEqual(Array(roster.length).fill(1));
    expect(board.body.winnerIds).toHaveLength(roster.length);
    const finalSnapshot = JSON.stringify({
      rankings: board.body.rankings,
      winnerIds: board.body.winnerIds,
    });
    const firstQuestion = await prisma.quizSessionQuestion.findFirstOrThrow({
      where: { sessionId: quizIds[0] },
      select: { questionId: true },
    });
    const firstOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: firstQuestion.questionId },
      select: { id: true },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${quizIds[0]}/answers`)
      .auth(host.token, { type: 'bearer' })
      .send({ questionId: firstQuestion.questionId, selectedOptionId: firstOption.id })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${quizIds[0]}/complete`)
      .auth(host.token, { type: 'bearer' }).expect(409);
    const unchangedBoard = await request(app.getHttpServer())
      .get(`/api/v1/competitions/${competitionId}/leaderboard`)
      .auth(student.token, { type: 'bearer' }).expect(200);
    expect(JSON.stringify({
      rankings: unchangedBoard.body.rankings,
      winnerIds: unchangedBoard.body.winnerIds,
    })).toBe(finalSnapshot);
    for (const id of quizIds) {
      const session = await prisma.quizSession.findUniqueOrThrow({ where: { id } });
      expect(session.status).toBe('COMPLETED');
      expect(session.score).toBe(0);
    }
  });
});
