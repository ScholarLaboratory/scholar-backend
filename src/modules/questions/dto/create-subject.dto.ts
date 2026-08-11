import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;
}