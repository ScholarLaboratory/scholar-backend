import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCompetitionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsUUID()
  topicId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  questionCount?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(7200)
  durationSeconds?: number;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
