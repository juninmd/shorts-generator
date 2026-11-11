import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest sem globals: desmonta a árvore entre os testes para evitar elementos vazados.
afterEach(() => cleanup());
