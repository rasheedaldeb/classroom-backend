declare global {
  namespace Express {
    interface Request {
      users?: {
        role?: "admin" | "teacher" | "student";
      };
    }
  }
}
export {};
