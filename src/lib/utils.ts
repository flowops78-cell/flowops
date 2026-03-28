import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatValue = (amount: number) => {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return formatted;
};

export const formatCompactNumber = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
  }).format(value);
};

export const formatCompactValue = (amount: number) => {
  if (Math.abs(amount) < 1000) return formatValue(amount);
  const sign = amount < 0 ? '-' : '';
  const compact = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.abs(amount));

  return `${sign}${compact}`;
};

export const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatTime = (date: string | Date) => {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const APP_MIN_DATE = '2000-01-01';

export const isValidIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

export const isDateOnOrAfter = (value: string, minDate: string) => value >= minDate;

export const parseNonNegativeNumber = (value: string | number) => {
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
};
