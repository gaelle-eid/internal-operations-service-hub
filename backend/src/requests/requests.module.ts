import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestEntity } from './entities/request.entity';
import { StatusHistoryEntry } from './entities/status-history.entity';
import { IntakeService } from './intake/intake.service';
import { INTAKE_PROVIDER, RequestyIntakeProvider } from './intake/intake.provider';
import { AgentService } from './agent.service';

@Module({
  imports: [TypeOrmModule.forFeature([RequestEntity, StatusHistoryEntry])],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    IntakeService,
    AgentService,
    RequestyIntakeProvider,
    {
      provide: INTAKE_PROVIDER,
      useExisting: RequestyIntakeProvider,
    },
  ],
})
export class RequestsModule {}
