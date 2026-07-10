import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { PublicExpertTalkQueryDto } from '@modules/master/dto/expert-talk.dto';
import { ExpertTalkService } from '@modules/master/services/expert-talk.service';

@ApiTags('Public Expert Talks')
@Controller('public/expert-talks')
export class PublicExpertTalkController {
  constructor(private readonly expertTalkService: ExpertTalkService) {}

  @ApiOperation({ summary: 'List active expert talks and podcasts (paginated)' })
  @ResponseMessage('Expert talks retrieved successfully')
  @Get()
  getExpertTalks(@Query() query: PublicExpertTalkQueryDto) {
    return this.expertTalkService.findAllPublic(query);
  }
}
