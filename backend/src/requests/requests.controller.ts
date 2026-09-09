import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { TransitionRequestDto } from './dto/transition-request.dto';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  // Submits a new request. Always starts at SUBMITTED (docs/product-spec.md).
  @Post()
  create(@Body() dto: CreateRequestDto) {
    return this.requestsService.create(dto);
  }

  @Get()
  findAll() {
    return this.requestsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.requestsService.findOne(id);
  }

  // The append-only audit trail for one request.
  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.requestsService.getHistory(id);
  }

  // One generic transition endpoint rather than one per status, so the
  // lifecycle can grow (WAITING_ON_REQUESTER, RESOLVED, CLOSED) without
  // adding new routes — only the VALID_TRANSITIONS map in the service
  // needs to change.
  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() dto: TransitionRequestDto) {
    return this.requestsService.transition(id, dto.toStatus, dto.changedBy);
  }
}
