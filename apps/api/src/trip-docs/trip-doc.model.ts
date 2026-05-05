import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TripDocDocument = HydratedDocument<TripDoc>;

@Schema({ timestamps: true })
export class TripDoc {
  @Prop({ type: Types.ObjectId, ref: 'Trip', required: true, index: true })
  tripId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  /** Ключ объекта в S3 (например trips/.../documents/...) */
  @Prop({ required: true })
  objectKey!: string;

  @Prop({ required: true, trim: true })
  originalFilename!: string;

  @Prop({ required: true, trim: true })
  contentType!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
}

export const TripDocSchema = SchemaFactory.createForClass(TripDoc);
TripDocSchema.index({ tripId: 1, createdAt: -1 });
