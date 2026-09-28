import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RequestActor, RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { TransitionRequestDto } from './dto/transition-request.dto';
import { IntakeRequestDto } from './dto/intake-request.dto';
import { IntakeService } from './intake/intake.service';
import { AgentRequestDto } from './dto/agent-request.dto';
import { AgentService } from './agent.service';
import { AuthGuard } from './auth.guard';
import { NotificationService } from './notification.service';
import { CurrentActor } from './current-actor.decorator';

@Controller('requests')
@UseGuards(AuthGuard)
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly intakeService: IntakeService,
    private readonly agentService: AgentService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post('intake')
  intake(@Body() dto: IntakeRequestDto) {
    return this.intakeService.classify(dto.text, dto.trustedContext?.departmentId);
  }

  @Post('agent')
  agent(@Body() dto: AgentRequestDto, @CurrentActor() actor: RequestActor) {
    return this.agentService.respond(dto.message, actor, dto.requestId);
  }

  // Submits a new request. Always starts at SUBMITTED (docs/product-spec.md).
  @Post()
  create(@Body() dto: CreateRequestDto, @CurrentActor() actor: RequestActor) {
    return this.requestsService.create(dto, actor);
  }

  @Get()
  findAll(@CurrentActor() actor: RequestActor) {
    return this.requestsService.findAll(actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentActor() actor: RequestActor) {
    return this.requestsService.findOne(id, actor);
  }

  // The append-only audit trail for one request.
  @Get(':id/history')
  getHistory(@Param('id') id: string, @CurrentActor() actor: RequestActor) {
    return this.requestsService.getHistory(id, actor);
  }

  @Get(':id/comments')
  getComments(@Param('id') id: string, @CurrentActor() actor: RequestActor) {
    return this.requestsService.getComments(id, actor);
  }

  @Get('notifications')
  getNotifications(@CurrentActor() actor: RequestActor) {
    return this.notificationService.listForUser(actor.id);
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() body: { body: string },
    @CurrentActor() actor: RequestActor,
  ) {
    return this.requestsService.addComment(id, actor.id, body.body, actor);
  }

  @Patch(':id/reassign')
  reassign(@Param('id') id: string, @Body() body: { assignedTo: string }, @CurrentActor() actor: RequestActor) {
    return this.requestsService.reassign(id, body.assignedTo, actor);
  }

  // One generic transition endpoint rather than one per status, so the
  // lifecycle can grow (WAITING_ON_REQUESTER, RESOLVED, CLOSED) without
  // adding new routes — only the VALID_TRANSITIONS map in the service
  // needs to change.
  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() dto: TransitionRequestDto, @CurrentActor() actor: RequestActor) {
    return this.requestsService.transition(id, dto.toStatus, dto.changedBy, actor);
  }
}
