import { IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTopicDto {
  @IsUUID()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;
}
