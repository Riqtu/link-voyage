import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TripPointDocument = HydratedDocument<TripPoint>;

@Schema({ _id: false })
export class PointCoordinates {
  @Prop({ required: true, min: -90, max: 90 })
  lat!: number;

  @Prop({ required: true, min: -180, max: 180 })
  lng!: number;
}

@Schema({ timestamps: true })
export class TripPoint {
  @Prop({ type: Types.ObjectId, ref: 'Trip', required: true, index: true })
  tripId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    trim: true,
    default: 'sight',
    enum: ['stay', 'food', 'sight', 'transport', 'other'],
  })
  category!: 'stay' | 'food' | 'sight' | 'transport' | 'other';

  @Prop({ type: PointCoordinates, required: true })
  coordinates!: PointCoordinates;

  @Prop()
  plannedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
}

export const TripPointSchema = SchemaFactory.createForClass(TripPoint);
TripPointSchema.index({ tripId: 1, updatedAt: -1 });
