import { Body, Controller, Get, Headers, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { RequestActor, RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { TransitionRequestDto } from './dto/transition-request.dto';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  // Submits a new request. Always starts at SUBMITTED (docs/product-spec.md).
  @Post()
  create(@Body() dto: CreateRequestDto, @Headers() headers: Record<string, string>) {
    return this.requestsService.create(dto, this.actor(headers));
  }

  @Get()
  findAll(@Headers() headers: Record<string, string>) {
    return this.requestsService.findAll(this.actor(headers));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Headers() headers: Record<string, string>) {
    return this.requestsService.findOne(id, this.actor(headers));
  }

  // The append-only audit trail for one request.
  @Get(':id/history')
  getHistory(@Param('id') id: string, @Headers() headers: Record<string, string>) {
    return this.requestsService.getHistory(id, this.actor(headers));
  }

  // One generic transition endpoint rather than one per status, so the
  // lifecycle can grow (WAITING_ON_REQUESTER, RESOLVED, CLOSED) without
  // adding new routes — only the VALID_TRANSITIONS map in the service
  // needs to change.
  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() dto: TransitionRequestDto, @Headers() headers: Record<string, string>) {
    return this.requestsService.transition(id, dto.toStatus, dto.changedBy, this.actor(headers));
  }

  private actor(headers: Record<string, string>): RequestActor {
    const role = headers['x-user-role'] as RequestActor['role'];
    if (!headers['x-user-id'] || !['employee', 'staff', 'admin'].includes(role)) {
      throw new UnauthorizedException('x-user-id and x-user-role headers are required');
    }
    return { id: headers['x-user-id'], role, departmentId: headers['x-department-id'] };
  }
}
