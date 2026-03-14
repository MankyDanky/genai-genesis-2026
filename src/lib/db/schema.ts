import { z } from "zod";
import type { ObjectId } from "mongodb";

export const SaveGameRequestSchema = z.object({
  code: z.string().min(1).max(2 * 1024 * 1024),
  title: z.string().max(200).optional(),
});

export type SaveGameRequest = z.infer<typeof SaveGameRequestSchema>;

export interface GameDocument {
  _id: ObjectId;
  code: string;
  title: string;
  codeLength: number;
  createdAt: Date;
  expiresAt: Date;
}
