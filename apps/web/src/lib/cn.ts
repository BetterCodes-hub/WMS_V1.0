import clsx, { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Łączy klasy i rozwiązuje konflikty Tailwind (np. w-full + w-auto → w-auto). */
export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
