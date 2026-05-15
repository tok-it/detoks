import { getAvailableBookTitles, returnBook } from "./services/rentalService.js";
import { sendOverdueReminders } from "./services/notificationService.js";

function main(): void {
  const availableSoftwareBooks = getAvailableBookTitles("software");
  const returnResult = returnBook("book-2", "2026-05-15");
  const reminders = sendOverdueReminders("2026-05-15");

  console.log("availableSoftwareBooks", availableSoftwareBooks);
  console.log("returnResult", returnResult);
  console.log("reminders", reminders);
}

main();
