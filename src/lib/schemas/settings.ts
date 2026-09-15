import { z } from 'zod'

export const THEME_VALUES = ['se', 'sp', 'st'] as const
export type ThemeValue = (typeof THEME_VALUES)[number]

export const updateThemeSchema = z.object({
  theme: z.enum(THEME_VALUES),
})
