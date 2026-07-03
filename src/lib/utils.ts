import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes safely — resolves conflicts, supports conditional classes. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
