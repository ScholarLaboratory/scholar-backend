import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AcademicLevel, Difficulty } from '@prisma/client';

export class CreateQuestionOptionDto {
  @IsString()
  @IsNotEmpty()
  optionText!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class CreateQuestionDto {
  @IsUUID()
  subjectId!: string;

  @IsUUID()
  topicId!: string;

  @IsString()
  @MinLength(5)
  questionText!: string;

  @IsEnum(AcademicLevel)
  academicLevel!: AcademicLevel;

  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionOptionDto)
  options!: CreateQuestionOptionDto[];
}
