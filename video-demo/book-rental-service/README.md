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

Current rental status:
- `Practical TypeScript` is currently rented by `Chris` until `2026-05-08` and is overdue as of `2026-05-15`.
- `Designing Friendly Systems` is currently rented by `Taylor` until `2026-05-20` and is still within the due date.
- `Clean Code Basics` is available.

Useful questions for demos:
- Where is the overdue fee calculated?
- Where are overdue reminder messages created?
- How are available books filtered before showing them to a user?
