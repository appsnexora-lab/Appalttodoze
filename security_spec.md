# Security Specification: ALTTO Firebase Integration

## 1. Data Invariants & Access Control Philosophy
- **Identity Isolation**: All book metadata, reading progress, goals, reflections, and lists belong strictly to the authenticated user identified by `request.auth.uid`.
- **Zero Cross-User Leakage**: Users can only read, list, create, update, and delete their own books and reading data located under `/users/{userId}/...`.
- **Relational Integrity**: Subcollections under `/users/{userId}` verify that `request.auth.uid == userId`.
- **Immutability of IDs & Ownership**: A book's `id`, `ownerId`, and `createdAt` cannot be changed after creation.
- **Strict Size and Type Validation**: All fields have bounded strings, proper numbers, and strict key allowlists.
- **Connection Test Document**: `/test/connection` allows authenticated or diagnostic check for SDK health without leaking user data.

## 2. The "Dirty Dozen" Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Read**: Anonymous/unauthenticated request attempting `get` on `/users/{userId}/books/{bookId}`.
2. **Cross-User Book Read**: User A (`uid_1`) attempting to read `/users/uid_2/books/book_99`.
3. **Cross-User Book Creation**: User A attempting to write `/users/uid_2/books/book_99` with `ownerId: "uid_1"`.
4. **Owner Impersonation**: User A attempting to create `/users/uid_1/books/book_99` with `ownerId: "uid_2"`.
5. **Ghost Field Injection (Shadow Update)**: User A attempting to add an unauthorized property `isAdmin: true` or `shadowField: "exploit"` to a book.
6. **Path Traversal / Malformed Document ID**: Injection attack using `..%2F` or 10KB string for `{bookId}`.
7. **Identity Mutation**: User A updating `/users/uid_1/books/book_1` with an altered `ownerId: "uid_attacker"`.
8. **Negative Pages / Invalid Number Injection**: User attempting to set `totalPages: -500` or `progressPercent: 99999`.
9. **Unbounded String Denial-of-Wallet**: Writing a 2MB payload into `title` or `author`.
10. **Arbitrary Top-Level Root Collection Read**: Attempting `get` or `list` on `/{document=**}` catch-all.
11. **Cross-User Reading Progress Modification**: User A writing to `/users/uid_2/reading_progress/prog_1`.
12. **Unverified Email State Change**: Non-whitelisted fields during quick state sync.
