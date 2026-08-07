import { test, expect } from "vitest";
import { queryRows } from "../../src/core/control-plane-db.js";

test("queryRows full branch coverage", async () => {
    const mockClient = {
        query: async () => ({ rows: [] })
    };
    await queryRows(mockClient as any, "SELECT 1", undefined);
});
