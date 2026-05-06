import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  /** Фамилия (опционально; отдельно от имени). */
  @Prop({ type: String, trim: true })
  lastName?: string;

  /** Публичный URL аватара в нашем S3 (путь users/…/avatar/). */
  @Prop({ type: String, trim: true, maxlength: 2048 })
  avatarUrl?: string;

  /** Системная роль (не путать с ролью в поездке). */
  @Prop({ type: String, enum: ['user', 'admin'], default: 'user' })
  systemRole!: 'user' | 'admin';

  @Prop({ required: true })
  passwordHash!: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true });
