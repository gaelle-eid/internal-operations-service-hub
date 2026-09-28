import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsModule } from './requests/requests.module';
import { RequestEntity } from './requests/entities/request.entity';
import { StatusHistoryEntry } from './requests/entities/status-history.entity';
import { CommentEntry } from './requests/entities/comment.entity';
import { NotificationEntry } from './requests/entities/notification.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.DB_PATH || 'service-hub.sqlite',
      entities: [RequestEntity, StatusHistoryEntry, CommentEntry, NotificationEntry],
      synchronize: true,
    }),
    RequestsModule,
  ],
})
export class AppModule {}
