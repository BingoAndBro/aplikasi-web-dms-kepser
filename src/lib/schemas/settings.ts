import { z } from 'zod'

export const THEME_VALUES = ['se', 'sp', 'st'] as const
export type ThemeValue = (typeof THEME_VALUES)[number]

export const updateThemeSchema = z.object({
  theme: z.enum(THEME_VALUES),
})

export const updateGeneralSettingsSchema = z.object({
  appTitle: z.string().trim().min(1, 'Judul tidak boleh kosong').max(80),
  appSubtitle: z.string().trim().max(80).optional(),
})
