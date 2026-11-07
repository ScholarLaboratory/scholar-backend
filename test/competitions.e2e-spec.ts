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
      await prisma.challenge.deleteMany({ where: { topicId } });
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
    // A facilitator can author content, while the public listing remains answer-safe.
    const authored = await request(app.getHttpServer()).post('/api/v1/questions')
      .auth(host.token, { type: 'bearer' })
      .send({
        subjectId, topicId, questionText: 'Facilitator authored question?',
        academicLevel: 'SECONDARY', difficulty: 'BEGINNER',
        options: [{ optionText: 'Yes', isCorrect: true }, { optionText: 'No', isCorrect: false }],
      }).expect(201);
    expect(authored.body.options.some((option: { isCorrect: boolean }) => option.isCorrect))
      .toBe(true);
    const publicQuestions = await request(app.getHttpServer())
      .get(`/api/v1/topics/${topicId}/questions`).expect(200);
    const publicAuthored = publicQuestions.body.find((question: { id: string }) =>
      question.id === authored.body.id);
    expect(publicAuthored).toBeDefined();
    expect(publicAuthored.options.every((option: Record<string, unknown>) =>
      !Object.prototype.hasOwnProperty.call(option, 'isCorrect'))).toBe(true);
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
    const foreignQuestion = await prisma.question.create({
      data: {
        subjectId, topicId, questionText: 'Not assigned to this quiz',
        academicLevel: 'SECONDARY', difficulty: 'BEGINNER',
        source: 'PLATFORM', status: 'PUBLISHED',
        options: { create: [
          { optionText: 'Foreign correct', isCorrect: true },
          { optionText: 'Foreign incorrect', isCorrect: false },
        ] },
      },
      include: { options: true },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${quizIds[0]}/answers`)
      .auth(host.token, { type: 'bearer' })
      .send({
        questionId: foreignQuestion.id,
        selectedOptionId: foreignQuestion.options[0].id,
      }).expect(400);

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


    // The question is assigned, but the selected option belongs to another question.
    const assignedQuestionId = questionSets[0][0];
    const mismatchedOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: { not: assignedQuestionId }, question: { topicId } },
      select: { id: true },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${quizIds[0]}/answers`)
      .auth(host.token, { type: 'bearer' })
      .send({ questionId: assignedQuestionId, selectedOptionId: mismatchedOption.id })
      .expect(400);

    // Only the first answer to an assigned question may be persisted.
    const validOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: assignedQuestionId, isCorrect: false },
      select: { id: true },
    });
    const answerPayload = {
      questionId: assignedQuestionId,
      selectedOptionId: validOption.id,
    };
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${quizIds[0]}/answers`)
      .auth(host.token, { type: 'bearer' })
      .send(answerPayload).expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${quizIds[0]}/answers`)
      .auth(host.token, { type: 'bearer' })
      .send(answerPayload).expect(409);
    expect(await prisma.quizAnswer.count({
      where: { sessionId: quizIds[0], questionId: assignedQuestionId },
    })).toBe(1);

    // Two simultaneous submissions for another question must have one winner.
    const secondQuestionId = questionSets[0][1];
    const secondOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: secondQuestionId, isCorrect: false },
      select: { id: true },
    });
    const concurrentPayload = {
      questionId: secondQuestionId, selectedOptionId: secondOption.id,
    };
    const concurrentResults = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/quizzes/${quizIds[0]}/answers`)
        .auth(host.token, { type: 'bearer' }).send(concurrentPayload),
      request(app.getHttpServer()).post(`/api/v1/quizzes/${quizIds[0]}/answers`)
        .auth(host.token, { type: 'bearer' }).send(concurrentPayload),
    ]);
    expect(concurrentResults.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.quizAnswer.count({
      where: { sessionId: quizIds[0], questionId: secondQuestionId },
    })).toBe(1);

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
  it('completes a standalone quiz and awards XP exactly once', async () => {
    const player = await register(4);
    const started = await request(app.getHttpServer())
      .post('/api/v1/quizzes')
      .auth(player.token, { type: 'bearer' })
      .send({ topicId, questionCount: 2 }).expect(201);
    const sessionId = started.body.id as string;
    expect(started.body.questions).toHaveLength(2);
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${sessionId}/complete`)
      .auth(player.token, { type: 'bearer' }).expect(400);
    const incomplete = await prisma.quizSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(incomplete).toMatchObject({
      status: 'IN_PROGRESS', score: 0, xpEarned: 0,
    });
    for (const question of started.body.questions as { id: string }[]) {
      const correct = await prisma.questionOption.findFirstOrThrow({
        where: { questionId: question.id, isCorrect: true },
        select: { id: true },
      });
      await request(app.getHttpServer())
        .post(`/api/v1/quizzes/${sessionId}/answers`)
        .auth(player.token, { type: 'bearer' })
        .send({ questionId: question.id, selectedOptionId: correct.id })
        .expect(201);
    }
    const completed = await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${sessionId}/complete`)
      .auth(player.token, { type: 'bearer' }).expect(201);
    expect(completed.body).toMatchObject({
      sessionId, score: 2, total: 2, percentage: 100, xpEarned: 20,
    });
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${sessionId}/complete`)
      .auth(player.token, { type: 'bearer' }).expect(409);
    const persisted = await prisma.quizSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(persisted).toMatchObject({
      status: 'COMPLETED', score: 2, xpEarned: 20,
    });
    const results = await request(app.getHttpServer())
      .get('/api/v1/quizzes/results/me')
      .auth(player.token, { type: 'bearer' }).expect(200);
    expect(results.body).toContainEqual(expect.objectContaining({
      id: sessionId, score: 2, xpEarned: 20,
    }));
    const globalBoard = await request(app.getHttpServer())
      .get('/api/v1/quizzes/leaderboard')
      .auth(player.token, { type: 'bearer' }).expect(200);
    expect(globalBoard.body).toContainEqual(expect.objectContaining({
      user: expect.objectContaining({ id: player.id }),
      totalXp: 20,
      correctAnswers: 2,
      completedQuizzes: 1,
    }));
    const otherStudent = await register(5);
    const otherResults = await request(app.getHttpServer())
      .get('/api/v1/quizzes/results/me')
      .auth(otherStudent.token, { type: 'bearer' }).expect(200);
    expect(otherResults.body).not.toContainEqual(expect.objectContaining({
      id: sessionId,
    }));
    await request(app.getHttpServer())
      .get(`/api/v1/quizzes/${sessionId}`)
      .auth(otherStudent.token, { type: 'bearer' }).expect(403);
  });

  it('settles an expired 1v1 challenge once and rejects answers after the deadline', async () => {
    const challenger = await register(6);
    const opponent = await register(7);
    const created = await request(app.getHttpServer())
      .post('/api/v1/challenges')
      .auth(challenger.token, { type: 'bearer' })
      .send({ opponentId: opponent.id, topicId, questionCount: 2, durationSeconds: 30 })
      .expect(201);
    const challengeId = created.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/challenges/${challengeId}/accept`)
      .auth(opponent.token, { type: 'bearer' }).expect(201);
    const [challengerReady, opponentReady] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/challenges/${challengeId}/ready`)
        .auth(challenger.token, { type: 'bearer' }),
      request(app.getHttpServer())
        .post(`/api/v1/challenges/${challengeId}/ready`)
        .auth(opponent.token, { type: 'bearer' }),
    ]);
    expect(challengerReady.status).toBe(201);
    expect(opponentReady.status).toBe(201);
    const readyAgain = await request(app.getHttpServer())
      .post(`/api/v1/challenges/${challengeId}/ready`)
      .auth(challenger.token, { type: 'bearer' }).expect(201);
    expect(readyAgain.body.status).toBe('STARTED');
    const challenge = await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge.startsAt).not.toBeNull();
    expect(challenge.endsAt).not.toBeNull();
    expect(new Date(challenge.endsAt!).getTime() - new Date(challenge.startsAt!).getTime())
      .toBe(30000);
    expect(new Date(readyAgain.body.startsAt).getTime())
      .toBe(new Date(challenge.startsAt!).getTime());
    const challengerQuizId = challenge.challengerQuizId!;
    const opponentQuizId = challenge.opponentQuizId!;
    const assigned = await prisma.quizSessionQuestion.findFirstOrThrow({
      where: { sessionId: challengerQuizId }, select: { questionId: true },
    });
    const correct = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: assigned.questionId, isCorrect: true }, select: { id: true },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/quizzes/${challengerQuizId}/answers`)
      .auth(challenger.token, { type: 'bearer' })
      .send({ questionId: assigned.questionId, selectedOptionId: correct.id }).expect(201);
    await prisma.challenge.update({
      where: { id: challengeId }, data: { endsAt: new Date(Date.now() - 1000) },
    });
    const [first, second, lateAnswer] = await Promise.all([
      request(app.getHttpServer()).get(`/api/v1/challenges/${challengeId}`)
        .auth(challenger.token, { type: 'bearer' }),
      request(app.getHttpServer()).get(`/api/v1/challenges/${challengeId}`)
        .auth(opponent.token, { type: 'bearer' }),
      request(app.getHttpServer()).post(`/api/v1/quizzes/${challengerQuizId}/answers`)
        .auth(challenger.token, { type: 'bearer' })
        .send({ questionId: assigned.questionId, selectedOptionId: correct.id }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(lateAnswer.status).toBe(409);
    const settled = await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(settled).toMatchObject({ status: 'COMPLETED', winnerId: challenger.id });
    for (const [id, score] of [[challengerQuizId, 1], [opponentQuizId, 0]] as const) {
      const quiz = await prisma.quizSession.findUniqueOrThrow({ where: { id } });
      expect(quiz).toMatchObject({ status: 'COMPLETED', score, xpEarned: score * 10 });
    }
    const finalized = await request(app.getHttpServer())
      .post(`/api/v1/challenges/${challengeId}/finalize`)
      .auth(opponent.token, { type: 'bearer' }).expect(201);
    expect(finalized.body).toMatchObject({ status: 'COMPLETED', winnerId: challenger.id });
  });

});
