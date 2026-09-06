/**
 * Toasts — Sonner (decided 2026-09-06). For transient, action-free feedback
 * only: a save landed, a row was restored, the layout was reset, a recipe was
 * loaded into Control. Anything with an action, a `targetPath` or a
 * `block` severity is a notice (spec §14) and never a toast.
 */

import { toast as sonner } from 'sonner'

export const toast = {
  info(message: string, description?: string) {
    sonner(message, description ? { description } : undefined)
  },
  success(message: string, description?: string) {
    sonner.success(message, description ? { description } : undefined)
  },
  warn(message: string, description?: string) {
    sonner.warning(message, description ? { description } : undefined)
  },
}
