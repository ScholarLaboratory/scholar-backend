import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateChallengeDto {
  @IsUUID()
  opponentId!: string;

  @IsUUID()
  topicId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  questionCount?: number;
}
