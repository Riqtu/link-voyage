import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AccommodationCommentDocument =
  HydratedDocument<AccommodationComment>;

@Schema({
  timestamps: true,
  collection: 'accommodation_comments',
})
export class AccommodationComment {
  @Prop({ type: Types.ObjectId, ref: 'Trip', required: true, index: true })
  tripId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Accommodation',
    required: true,
    index: true,
  })
  accommodationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  body!: string;
}

export const AccommodationCommentSchema =
  SchemaFactory.createForClass(AccommodationComment);

AccommodationCommentSchema.index({
  tripId: 1,
  accommodationId: 1,
  createdAt: 1,
});
