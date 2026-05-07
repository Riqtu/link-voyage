import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TripReceiptDocument = HydratedDocument<TripReceipt>;

/** Доля каждого по количеству — сумма строки делится пропорционально qty */
@Schema({ _id: false })
export class TripReceiptConsumption {
  @Prop({ required: true })
  userId!: string;

  @Prop({ type: Number, required: true })
  qty!: number;
}

export const TripReceiptConsumptionSchema = SchemaFactory.createForClass(
  TripReceiptConsumption,
);

@Schema({ _id: false })
export class TripReceiptLine {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  /** Количество из чека (общее по строке) */
  @Prop({ type: Number, required: true, default: 1 })
  qty!: number;

  @Prop({ type: Number })
  unitPrice?: number;

  /** Сумма строки как в чеке */
  @Prop({ type: Number, required: true })
  lineTotal!: number;

  /** Старый формат: сумма строки делилась поровну между указанными */
  @Prop({ type: [String], default: [] })
  participantUserIds!: string[];

  /** Новый формат: кто сколько из qty себе записал → lineTotal * (qtyᵢ / Σqty) */
  @Prop({
    type: [TripReceiptConsumptionSchema],
    default: [],
  })
  consumptions!: TripReceiptConsumption[];
}

export const TripReceiptLineSchema =
  SchemaFactory.createForClass(TripReceiptLine);

@Schema({ _id: false })
export class TripReceiptExternalParticipant {
  @Prop({ required: true, trim: true })
  id!: string;

  @Prop({ required: true, trim: true })
  name!: string;
}

export const TripReceiptExternalParticipantSchema =
  SchemaFactory.createForClass(TripReceiptExternalParticipant);

@Schema({ timestamps: true })
export class TripReceipt {
  @Prop({ type: Types.ObjectId, ref: 'Trip', required: true, index: true })
  tripId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  paidByUserId!: Types.ObjectId;

  @Prop({ trim: true })
  imageUrl?: string;

  @Prop({ trim: true, default: 'RUB' })
  currency!: string;

  @Prop({ type: [TripReceiptLineSchema], default: [] })
  lineItems!: TripReceiptLine[];

  /** Участники чека, которых нет в составе поездки (локально для этого чека). */
  @Prop({ type: [TripReceiptExternalParticipantSchema], default: [] })
  externalParticipants!: TripReceiptExternalParticipant[];

  /**
   * Участники, которые отметили перевод своей доли оплатившему чек
   * (без платёжной интеграции — просто статус для группы).
   */
  @Prop({ type: [String], default: [] })
  reimbursedPayerUserIds!: string[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
}

export const TripReceiptSchema = SchemaFactory.createForClass(TripReceipt);
TripReceiptSchema.index({ tripId: 1, createdAt: -1 });
