// Vitest setup — mock "server-only" stub so server modules can be imported in tests.
import { vi } from "vitest";

// "server-only" is a Next.js package that throws when imported from client code.
// In tests, we just need it to be a no-op.
vi.mock("server-only", () => ({}));

// Mock next/headers cookies() since it's not available in test env.
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: () => undefined, set: () => {}, delete: () => {} })),
}));
