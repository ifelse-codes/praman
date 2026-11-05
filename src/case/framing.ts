import { z } from 'zod';

/** Presentation only: never crop, replace or silently retarget the observed surface. */
export const sceneFramingSchema = z.object({
  caption: z.enum(['auto', 'top', 'bottom']).optional(),
  padding: z.number().int().min(0).max(32).optional(),
}).strict();
export type SceneFraming = z.infer<typeof sceneFramingSchema>;
