import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './database/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { QuizModule } from './modules/quiz/quiz.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    QuestionsModule,
    QuizModule,
  ],
})
export class AppModule {}