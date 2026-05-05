import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AccommodationComment,
  AccommodationCommentSchema,
} from './accommodation-comments/accommodation-comment.model';
import {
  Accommodation,
  AccommodationSchema,
} from './accommodations/accommodation.model';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisProvider } from './redis.provider';
import { TripDoc, TripDocSchema } from './trip-docs/trip-doc.model';
import { TripPoint, TripPointSchema } from './trip-points/trip-point.model';
import { Trip, TripSchema } from './trips/trip.model';
import { User, UserSchema } from './users/user.model';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGODB_URI') ??
          'mongodb://localhost:27017/link-voyage',
        bufferCommands: false,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      }),
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Trip.name, schema: TripSchema },
      { name: Accommodation.name, schema: AccommodationSchema },
      {
        name: AccommodationComment.name,
        schema: AccommodationCommentSchema,
      },
      { name: TripPoint.name, schema: TripPointSchema },
      { name: TripDoc.name, schema: TripDocSchema },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService, RedisProvider],
})
export class AppModule {}
