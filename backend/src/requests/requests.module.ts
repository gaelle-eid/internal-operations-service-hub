import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestEntity } from './entities/request.entity';
import { StatusHistoryEntry } from './entities/status-history.entity';
import { CommentEntry } from './entities/comment.entity';
import { IntakeService } from './intake/intake.service';
import { INTAKE_PROVIDER, RequestyIntakeProvider } from './intake/intake.provider';
import { AgentService } from './agent.service';
import { NotificationEntry } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { AssignmentHistoryEntry } from './entities/assignment-history.entity';
import { OidcAuthService } from './oidc-auth.service';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([RequestEntity, StatusHistoryEntry, CommentEntry, NotificationEntry, AssignmentHistoryEntry])],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    IntakeService,
    AgentService,
    NotificationService,
    OidcAuthService,
    AuthGuard,
    RequestyIntakeProvider,
    {
      provide: INTAKE_PROVIDER,
      useExisting: RequestyIntakeProvider,
    },
  ],
})
export class RequestsModule {}
