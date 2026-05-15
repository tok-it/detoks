import { books, type Book } from "../data/books.js";
import { rentals, type RentalRecord } from "../data/rentals.js";

export function listAvailableBooks(category?: string): Book[] {
  return books.filter((book) => {
    if (!book.available) return false;
    if (!category) return true;
    return book.category === category;
  });
}

export function findBookById(bookId: string): Book | undefined {
  return books.find((book) => book.id === bookId);
}

export function findActiveRentalByBookId(bookId: string): RentalRecord | undefined {
  return rentals.find((rental) => rental.bookId === bookId && !rental.returnedAt);
}

export function findOverdueRentals(today: string): RentalRecord[] {
  return rentals.filter((rental) => !rental.returnedAt && rental.dueDate < today);
}
