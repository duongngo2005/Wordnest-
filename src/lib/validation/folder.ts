import { z } from "zod";

export const folderIconSchema = z.enum(["book", "target", "calendar", "graduation"]);
export const folderColorSchema = z.enum(["orange", "blue", "green", "purple"]);

const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Tên collection không được để trống")
  .max(120, "Tên collection không được dài quá 120 ký tự");

export const createFolderSchema = z.object({
  name: folderNameSchema,
  description: z.string().trim().max(1_000).optional().transform((value) => value || undefined),
  icon: folderIconSchema.optional().default("book"),
  color: folderColorSchema.optional().default("orange"),
});

export const updateFolderSchema = z
  .object({
    name: folderNameSchema.optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    icon: folderIconSchema.optional(),
    color: folderColorSchema.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Cần cung cấp ít nhất một thay đổi cho collection",
  });

export const createDeckInFolderSchema = z.object({
  name: z.string().trim().min(1, "Tên bộ thẻ không được để trống").max(200),
  description: z.string().trim().max(1_000).optional().transform((value) => value || undefined),
});

export const moveDeckSchema = z.object({
  folderId: z.string().min(1).nullable(),
});

export const reorderFolderDecksSchema = z.object({
  deckIds: z
    .array(z.string().min(1))
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "Danh sách bộ thẻ không được trùng lặp"),
});

export type FolderIcon = z.infer<typeof folderIconSchema>;
export type FolderColor = z.infer<typeof folderColorSchema>;

export interface CreateFolderInput {
  name: string;
  description?: string;
  icon?: FolderIcon;
  color?: FolderColor;
}

export interface UpdateFolderInput {
  name?: string;
  description?: string | null;
  icon?: FolderIcon;
  color?: FolderColor;
}
