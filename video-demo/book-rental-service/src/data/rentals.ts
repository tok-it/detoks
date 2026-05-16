export interface RentalRecord {
  rentalId: string;
  bookId: string;
  userName: string;
  rentedAt: string;
  dueDate: string;
  returnedAt?: string;
}

export const rentals: RentalRecord[] = [
  {
    rentalId: "rental-1",
    bookId: "book-2",
    userName: "Chris",
    rentedAt: "2026-05-01",
    dueDate: "2026-05-08",
  },
  {
    rentalId: "rental-2",
    bookId: "book-3",
    userName: "Taylor",
    rentedAt: "2026-05-10",
    dueDate: "2026-05-20",
  },
];
