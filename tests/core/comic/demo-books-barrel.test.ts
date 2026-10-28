import { describe, it, expect } from 'vitest';
import * as demoBooks from '../../../src/core/comic/demo-books.js';
import * as flash from '../../../src/core/comic/demo-books-flash.js';
import * as shrek from '../../../src/core/comic/demo-books-shrek.js';
import * as misc from '../../../src/core/comic/demo-books-misc.js';

describe('demo-books barrel', () => {
    it('should export flash functions', () => {
        for (const key of Object.keys(flash)) {
            expect((demoBooks as any)[key]).toBe((flash as any)[key]);
        }
    });

    it('should export shrek functions', () => {
        for (const key of Object.keys(shrek)) {
            expect((demoBooks as any)[key]).toBe((shrek as any)[key]);
        }
    });

    it('should export misc functions', () => {
        for (const key of Object.keys(misc)) {
            expect((demoBooks as any)[key]).toBe((misc as any)[key]);
        }
    });
});
