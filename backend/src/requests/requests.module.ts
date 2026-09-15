import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestEntity } from './entities/request.entity';
import { StatusHistoryEntry } from './entities/status-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RequestEntity, StatusHistoryEntry])],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
