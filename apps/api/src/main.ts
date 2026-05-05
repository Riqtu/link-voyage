import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import type { Express } from 'express';
import { Model } from 'mongoose';
import {
  AccommodationComment,
  AccommodationCommentDocument,
} from './accommodation-comments/accommodation-comment.model';
import {
  Accommodation,
  AccommodationDocument,
} from './accommodations/accommodation.model';
import { AppModule } from './app.module';
import { TripDoc, TripDocDocument } from './trip-docs/trip-doc.model';
import { TripPoint, TripPointDocument } from './trip-points/trip-point.model';
import {
  TripReceipt,
  TripReceiptDocument,
} from './trip-receipts/trip-receipt.model';
import { Trip, TripDocument } from './trips/trip.model';
import { createTrpcContext, getAuthUserFromRequest } from './trpc/trpc.context';
import { appRouter } from './trpc/trpc.router';
import { User, UserDocument } from './users/user.model';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  const tripModel = app.get<Model<TripDocument>>(getModelToken(Trip.name));
  const accommodationModel = app.get<Model<AccommodationDocument>>(
    getModelToken(Accommodation.name),
  );
  const accommodationCommentModel = app.get<
    Model<AccommodationCommentDocument>
  >(getModelToken(AccommodationComment.name));
  const tripPointModel = app.get<Model<TripPointDocument>>(
    getModelToken(TripPoint.name),
  );
  const tripDocModel = app.get<Model<TripDocDocument>>(
    getModelToken(TripDoc.name),
  );
  const tripReceiptModel = app.get<Model<TripReceiptDocument>>(
    getModelToken(TripReceipt.name),
  );

  const expressApp = app.getHttpAdapter().getInstance() as unknown as Express;
  expressApp.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req, res }) =>
        createTrpcContext({
          req,
          res,
          authUser: getAuthUserFromRequest(req),
          models: {
            userModel,
            tripModel,
            accommodationModel,
            accommodationCommentModel,
            tripPointModel,
            tripDocModel,
            tripReceiptModel,
          },
        }),
    }),
  );

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
