import type { en } from './locales/en'

/** The shape every locale must match: English's keys, any string values.
 * Korean's English-only plural `_one` keys are allowed but not required. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }
type OptionalOne<T> = {
  [K in keyof T as K extends `${string}_one` ? never : K]: T[K] extends string ? string : OptionalOne<T[K]>
} & {
  [K in keyof T as K extends `${string}_one` ? K : never]?: string
}

/** A complete translation. Use this type on a new locale and the compiler
 * lists every key it is missing. */
export type Translation = OptionalOne<Widen<typeof en>>
