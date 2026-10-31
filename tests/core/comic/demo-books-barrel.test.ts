import { describe, it, expect } from 'vitest';
import * as demoBooks from '../../../src/core/comic/demo-books.js';
import { buildFlashpointDemoBook, buildFlashEpisode1DemoBook } from '../../../src/core/comic/demo-books-flash.js';
import { buildShrek1DemoBook } from '../../../src/core/comic/demo-books-shrek.js';
import { buildBiographyDemoBook, buildNewsDigestDemoBook, buildBookRecapDemoBook } from '../../../src/core/comic/demo-books-misc.js';

describe('demo-books barrel', () => {
    it('strict exports', () => {
        expect(demoBooks.buildFlashpointDemoBook).toBe(buildFlashpointDemoBook);
        expect(demoBooks.buildFlashEpisode1DemoBook).toBe(buildFlashEpisode1DemoBook);
        expect(demoBooks.buildShrek1DemoBook).toBe(buildShrek1DemoBook);
        expect(demoBooks.buildBiographyDemoBook).toBe(buildBiographyDemoBook);
        expect(demoBooks.buildNewsDigestDemoBook).toBe(buildNewsDigestDemoBook);
        expect(demoBooks.buildBookRecapDemoBook).toBe(buildBookRecapDemoBook);

        expect(demoBooks.default.buildFlashpointDemoBook).toBe(buildFlashpointDemoBook);
    });
});
