import { findBookById, findOverdueRentals } from "../repositories/bookRepository.js";
import { calculateDaysLate, calculateOverdueFee } from "../utils/feePolicy.js";

export interface ReminderMessage {
  rentalId: string;
  userName: string;
  message: string;
}

export function buildReminderMessage(rentalId: string, today: string): ReminderMessage | undefined {
  const rental = findOverdueRentals(today).find((item) => item.rentalId === rentalId);
  if (!rental) return undefined;

  const book = findBookById(rental.bookId);
  if (!book) return undefined;

  const daysLate = calculateDaysLate(rental.dueDate, today);
  const overdueFee = calculateOverdueFee(daysLate);

  return {
    rentalId: rental.rentalId,
    userName: rental.userName,
    message: `Reminder: "${book.title}" is ${daysLate} day(s) overdue. Current fee is ${overdueFee} won.`,
  };
}

export function sendOverdueReminders(today: string): ReminderMessage[] {
  return findOverdueRentals(today)
    .map((rental) => buildReminderMessage(rental.rentalId, today))
    .filter((message): message is ReminderMessage => message !== undefined);
}
