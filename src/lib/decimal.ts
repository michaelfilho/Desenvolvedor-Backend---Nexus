import { Prisma } from "@prisma/client";
import { AppError } from "./erros";

export const DECIMAL_SCALE = 10;

export function parsePositiveDecimal(input: string, fieldName: string): Prisma.Decimal {
  const parsed = new Prisma.Decimal(input);
  if (!parsed.isFinite() || parsed.lte(0)) {
    throw new AppError(`${fieldName} must be greater than zero`, 400);
  }
  return parsed;
}

export function formatDecimal(value: Prisma.Decimal | null): string | null {
  if (value === null) {
    return null;
  }
  const normalized = value.toFixed(DECIMAL_SCALE);
  return normalized.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function percentageOf(value: Prisma.Decimal, percentage: number): Prisma.Decimal {
  return value.mul(new Prisma.Decimal(percentage)).div(new Prisma.Decimal(100));
}


