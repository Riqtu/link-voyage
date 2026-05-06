import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type AccommodationDocument = HydratedDocument<Accommodation>;

@Schema({ _id: false })
export class AccommodationVote {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['up', 'down'] })
  value!: 'up' | 'down';
}

@Schema({ _id: false })
export class AccommodationCoordinates {
  @Prop({ required: true, min: -90, max: 90 })
  lat!: number;

  @Prop({ required: true, min: -180, max: 180 })
  lng!: number;
}

@Schema({ timestamps: true })
export class Accommodation {
  @Prop({ type: Types.ObjectId, ref: 'Trip', required: true, index: true })
  tripId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  provider?: string;

  @Prop({ trim: true })
  sourceUrl?: string;

  @Prop({ trim: true })
  locationLabel?: string;

  @Prop({ type: AccommodationCoordinates })
  coordinates?: AccommodationCoordinates;

  /** Полная цена варианта (за всё размещение / указанный срок — как договоритесь в команде) */
  @Prop()
  price?: number;

  /** Как интерпретировать цену: total/perNight/perPerson */
  @Prop({ trim: true, default: 'total' })
  pricingMode!: 'total' | 'perNight' | 'perPerson';

  @Prop({ trim: true, default: 'EUR' })
  currency!: string;

  @Prop()
  rating?: number;

  @Prop({ default: false })
  freeCancellation!: boolean;

  @Prop({ type: [String], default: [] })
  amenities!: string[];

  @Prop({ trim: true, default: 'shortlisted' })
  status!: 'shortlisted' | 'rejected' | 'booked';

  /** Объявление недоступно (уже снято другими и т.п.) — в UI карточка приглушается */
  @Prop({ default: false })
  noLongerAvailable!: boolean;

  @Prop({ trim: true })
  notes?: string;

  /** Текст с превью страницы (og:description / meta description) */
  @Prop({ trim: true })
  previewDescription?: string;

  /**
   * Фото карточки: `{ url }` или `{ url, zone? }` (зона типа «Спальня 1»).
   * В старых записях могли быть только строки-URL — нормализуем при чтении/save на уровне API.
   */
  @Prop({
    required: false,
    default: [],
    type: [MongooseSchema.Types.Mixed],
  })
  previewImages!: unknown[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: [AccommodationVote], default: [] })
  votes!: AccommodationVote[];
}

export const AccommodationSchema = SchemaFactory.createForClass(Accommodation);
AccommodationSchema.index({ tripId: 1, updatedAt: -1 });
