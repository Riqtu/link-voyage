import { Model } from 'mongoose';
import { IncomingMessage, ServerResponse } from 'node:http';
import { AccommodationCommentDocument } from '../accommodation-comments/accommodation-comment.model';
import { AccommodationDocument } from '../accommodations/accommodation.model';
import { AuthTokenPayload, verifyAccessToken } from '../auth/auth.utils';
import { TripDocDocument } from '../trip-docs/trip-doc.model';
import { TripPointDocument } from '../trip-points/trip-point.model';
import { TripReceiptDocument } from '../trip-receipts/trip-receipt.model';
import { TripDocument } from '../trips/trip.model';
import { UserDocument } from '../users/user.model';

export type TrpcContext = {
  req: IncomingMessage;
  res: ServerResponse;
  authUser: AuthTokenPayload | null;
  models: {
    userModel: Model<UserDocument>;
    tripModel: Model<TripDocument>;
    accommodationModel: Model<AccommodationDocument>;
    accommodationCommentModel: Model<AccommodationCommentDocument>;
    tripPointModel: Model<TripPointDocument>;
    tripDocModel: Model<TripDocDocument>;
    tripReceiptModel: Model<TripReceiptDocument>;
  };
};

export function createTrpcContext(opts: TrpcContext): TrpcContext {
  return opts;
}

export function getAuthUserFromRequest(
  req: IncomingMessage,
): AuthTokenPayload | null {
  const rawAuthHeader = req.headers.authorization;
  if (!rawAuthHeader || !rawAuthHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = rawAuthHeader.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }

  return verifyAccessToken(token);
}
