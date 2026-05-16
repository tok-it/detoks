export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  available: boolean;
}

export const books: Book[] = [
  {
    id: "book-1",
    title: "Clean Code Basics",
    author: "Alex Reed",
    category: "software",
    available: true,
  },
  {
    id: "book-2",
    title: "Practical TypeScript",
    author: "Mina Park",
    category: "software",
    available: false,
  },
  {
    id: "book-3",
    title: "Designing Friendly Systems",
    author: "Jordan Kim",
    category: "product",
    available: true,
  },
];
