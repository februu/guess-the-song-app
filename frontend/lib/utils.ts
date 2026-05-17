import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
// Utility function to combine class names using clsx and twMerge for Tailwind CSS
// This allows for conditional class names and merging of Tailwind classes without conflicts  
// Used by \components\ui\button.tsx
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
