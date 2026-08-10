import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'I enjoy chemistry and solving difficult problems.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  @ApiPropertyOptional({
    example: 'University of Ibadan',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  school?: string;

  @ApiPropertyOptional({
    example: 'SS3',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  level?: string;
}