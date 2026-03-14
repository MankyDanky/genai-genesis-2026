import { z } from "zod";
import type { ObjectId } from "mongodb";
import type { GameEngine } from "@/lib/game-engine";
import type { ProjectFile } from "@/lib/project-files";
import type {
  AudioTrack,
  GameControl,
  GeneratedImage,
  PlanningTodo,
} from "@/lib/game-forge-context";

export const PROJECT_SCHEMA_VERSION = 1;

export const ArtifactStorageSchema = z.enum(["inline", "gridfs"]);
export const ArtifactKindSchema = z.enum([
  "compiled-html",
  "chat-transcript",
  "image-binary",
  "audio-binary",
]);

export type ArtifactStorage = z.infer<typeof ArtifactStorageSchema>;
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export interface PersistedChatMessage {
  id: string;
  role: string;
  content?: unknown;
  parts?: unknown[];
  [key: string]: unknown;
}

export interface ArtifactRef {
  kind: ArtifactKind;
  storage: ArtifactStorage;
  contentType: string;
  byteLength: number;
  artifactId?: string | null;
  inlineText?: string | null;
}

export interface ArtifactDocument {
  _id: ObjectId;
  schemaVersion: number;
  kind: ArtifactKind;
  projectId: ObjectId | null;
  revisionId: ObjectId | null;
  contentType: string;
  byteLength: number;
  gridFsFileId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDocument {
  _id: ObjectId;
  schemaVersion: number;
  title: string;
  engine: GameEngine;
  status: "draft";
  latestRevisionNumber: number;
  latestRevisionId: ObjectId | null;
  latestPublishedRevisionId: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRevisionDocument {
  _id: ObjectId;
  schemaVersion: number;
  projectId: ObjectId;
  revisionNumber: number;
  title: string;
  engine: GameEngine;
  projectFiles: ProjectFile[];
  controls: GameControl[];
  planningTodos: PlanningTodo[];
  generatedImages: GeneratedImage[];
  audioTracks: AudioTrack[];
  compiledHtml: ArtifactRef;
  chatTranscript: ArtifactRef;
  createdAt: Date;
}

export interface PublishedGameDocument {
  _id: ObjectId;
  schemaVersion: number;
  projectId: ObjectId | null;
  revisionId: ObjectId | null;
  revisionNumber: number | null;
  title: string;
  engine: GameEngine;
  multiplayer: boolean;
  multiplayerProvider: "partykit" | null;
  multiplayerRoomType: string | null;
  compiledHtml: ArtifactRef;
  createdAt: Date;
}

const ProjectFileSchema = z.object({
  path: z.string().min(1).max(512),
  content: z.string(),
  kind: z.enum(["html", "style", "script", "asset", "config", "other"]),
});

const PlanningTodoSchema = z.object({
  id: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
});

const GameControlSchema = z.object({
  action: z.string().min(1).max(200),
  keys: z.string().min(1).max(200),
});

const GeneratedImageSchema = z.object({
  url: z.string().url(),
  prompt: z.string().min(1).max(5000),
});

const AudioTrackSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  type: z.enum(["music", "sfx"]),
  description: z.string().max(5000),
  dataUrl: z.string().nullable(),
  status: z.enum(["pending", "ready", "error"]),
  error: z.string().nullable().optional(),
  duration: z.number().nullable(),
  createdAt: z.number(),
});

const PersistedChatMessageSchema = z
  .object({
    id: z.string().min(1).max(200),
    role: z.string().min(1).max(50),
    content: z.unknown().optional(),
    parts: z.array(z.unknown()).optional(),
  })
  .catchall(z.unknown());

export const SaveProjectSnapshotRequestSchema = z.object({
  title: z.string().max(200).optional(),
  engine: z.enum(["canvas2d", "threejs"]),
  currentCode: z.string().nullable().optional(),
  projectFiles: z.array(ProjectFileSchema).max(500),
  controls: z.array(GameControlSchema).max(50).default([]),
  planningTodos: z.array(PlanningTodoSchema).max(400).default([]),
  generatedImages: z.array(GeneratedImageSchema).max(200).default([]),
  audioTracks: z.array(AudioTrackSchema).max(200).default([]),
  chatMessages: z.array(PersistedChatMessageSchema).max(2000).default([]),
});

export type SaveProjectSnapshotRequest = z.infer<
  typeof SaveProjectSnapshotRequestSchema
>;

export const PublishProjectRequestSchema = z.object({
  revisionNumber: z.number().int().positive().optional(),
});

export type PublishProjectRequest = z.infer<typeof PublishProjectRequestSchema>;
