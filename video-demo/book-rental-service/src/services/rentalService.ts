import {
  findActiveRentalByBookId,
  findBookById,
  listAvailableBooks,
} from "../repositories/bookRepository.js";
import { calculateDaysLate, calculateOverdueFee } from "../utils/feePolicy.js";

export function getAvailableBookTitles(category?: string): string[] {
  return listAvailableBooks(category).map((book) => book.title);
}

export function buildRentalSummary(bookId: string): string {
  const book = findBookById(bookId);
  if (!book) {
    return "Book not found.";
  }

  const activeRental = findActiveRentalByBookId(bookId);
  if (!activeRental) {
    return `${book.title} is currently available.`;
  }

  return `${book.title} is rented by ${activeRental.userName} until ${activeRental.dueDate}.`;
}

export function returnBook(bookId: string, returnedDate: string): {
  bookTitle: string;
  daysLate: number;
  overdueFee: number;
} {
  const book = findBookById(bookId);
  if (!book) {
    throw new Error("Book not found.");
  }

  const activeRental = findActiveRentalByBookId(bookId);
  if (!activeRental) {
    throw new Error("Active rental not found.");
  }

  const daysLate = calculateDaysLate(activeRental.dueDate, returnedDate);
  const overdueFee = calculateOverdueFee(daysLate);

  return {
    bookTitle: book.title,
    daysLate,
    overdueFee,
  };
}
