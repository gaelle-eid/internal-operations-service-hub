import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsModule } from './requests/requests.module';
import { getDatabaseConfig } from './database.config';

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    RequestsModule,
  ],
})
export class AppModule {}
