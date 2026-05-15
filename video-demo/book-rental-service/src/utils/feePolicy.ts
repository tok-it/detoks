const DAILY_OVERDUE_FEE = 500;
const MAX_OVERDUE_FEE = 10000;

export function calculateOverdueFee(daysLate: number): number {
  if (daysLate <= 0) return 0;
  return Math.min(daysLate * DAILY_OVERDUE_FEE, MAX_OVERDUE_FEE);
}

export function calculateDaysLate(dueDate: string, returnedDate: string): number {
  const due = new Date(dueDate);
  const returned = new Date(returnedDate);
  const diffMs = returned.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(diffDays, 0);
}
