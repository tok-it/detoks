# Book Rental Service Demo

This is a small demo project for recording cache and RAG behavior.

Domain:
- Users can rent books.
- Books become overdue after the due date passes.
- The system calculates overdue fees.
- The system sends reminder messages for overdue rentals.

Key files:
- `src/repositories/bookRepository.ts`
- `src/services/rentalService.ts`
- `src/services/notificationService.ts`
- `src/utils/feePolicy.ts`

Useful questions for demos:
- Where is the overdue fee calculated?
- Where are overdue reminder messages created?
- How are available books filtered before showing them to a user?
