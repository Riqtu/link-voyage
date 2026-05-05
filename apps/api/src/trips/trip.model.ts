import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TripDocument = HydratedDocument<Trip>;

@Schema({ _id: false })
export class TripMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['owner', 'member'], default: 'member' })
  role!: 'owner' | 'member';
}

@Schema({ _id: false })
export class TripInvite {
  @Prop({ required: true })
  code!: string;

  @Prop({ required: true })
  createdAt!: Date;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ default: false })
  used!: boolean;
}

@Schema({ timestamps: true })
export class Trip {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: [TripMember], default: [] })
  members!: TripMember[];

  @Prop({ type: [TripInvite], default: [] })
  invites!: TripInvite[];

  /** Сколько человек едет (для расчёта цены за человека в жилье и т.п.) */
  @Prop({ type: Number, default: 4 })
  peopleCount!: number;

  /** Дата начала поездки (опционально, для расчётов стоимости) */
  @Prop()
  startDate?: Date;

  /** Дата конца поездки (опционально, для расчётов стоимости) */
  @Prop()
  endDate?: Date;

  /** Таймзона поездки для календарей и дат */
  @Prop({ trim: true, default: 'Europe/Moscow' })
  timezone!: string;

  /** Требования к жилью (wifi, кухня, центр и т.п.) */
  @Prop({ type: [String], default: [] })
  housingRequirements!: string[];
}

export const TripSchema = SchemaFactory.createForClass(Trip);
TripSchema.index({ 'members.userId': 1, updatedAt: -1 });
TripSchema.index({ 'invites.code': 1 }, { unique: true, sparse: true });
