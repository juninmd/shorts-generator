import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wrapText, normalizePath, rel, esc, ensureFont, prepareBackground, prepareTextFiles } from '../../../src/core/quiz/quiz-assets.service.js';
import fs from 'node:fs';
import path from 'node:path';
import child_process from 'node:child_process';
import { logger } from '../../../src/core/logger.js';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('../../../src/core/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }
}));

describe('quiz-assets.service', () => {
  describe('wrapText', () => {
    it('wraps text based on max length', () => {
      expect(wrapText('hello world this is a test', 10)).toBe('hello\nworld this\nis a test');
    });

    it('handles exact length', () => {
      expect(wrapText('hello', 5)).toBe('hello');
    });

    it('handles empty string', () => {
      expect(wrapText('', 5)).toBe('');
    });

    it('handles exactly correct copy return true branches on candidates', () => {
      expect(wrapText('hello hello', 5)).toBe('hello\nhello');
    });

    it('handles a single word perfectly on the boundary without line break before it', () => {
      expect(wrapText('12345 67890', 5)).toBe('12345\n67890');
    });

    it('returns empty string when passed an empty string, handling the edge case of no words', () => {
      expect(wrapText('', 5)).toBe('');
    });

    it('handles exact word size boundary without a space', () => {
       expect(wrapText('h e', 1)).toBe('h\ne');
    });

    it('handles long word by making it a line', () => {
       expect(wrapText('hellohello hello', 5)).toBe('hellohello\nhello');
    });

    it('handles very long word at start correctly with empty line prefix', () => {
       expect(wrapText('hellohello', 5)).toBe('hellohello');
    });

    it('handles empty first current line properly', () => {
       expect(wrapText('hellohello world', 5)).toBe('hellohello\nworld');
    });

    it('covers branch where currentLine has no length and no space push', () => {
      expect(wrapText(' ', 5)).toBe('');
    });

    it('covers missing space coverage for branch check lines 16-22', () => {
      expect(wrapText('  ', 5)).toBe('');
    });

    it('covers single space edgecase', () => {
      expect(wrapText('a bbb cccc ddddd eeeeeee ffffffff', 4)).toBe('a\nbbb\ncccc\nddddd\neeeeeee\nffffffff');
    });
  });

  describe('normalizePath / rel / esc', () => {
    it('normalizes paths', () => {
      expect(normalizePath('C:\\test')).toBe(path.resolve('C:\\test').replace(/\\/g, '/'));
    });

    it('escapes correctly', () => {
      expect(esc('C:\\test:file')).toBe(rel('C:\\test:file').replace(/([:])/g, "\\$1"));
    });
  });

  describe('ensureFont', () => {
    let originalPlatform: NodeJS.Platform;

    beforeEach(() => {
      originalPlatform = process.platform;
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      });
      vi.resetAllMocks();
    });

    it('returns existing font if it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(ensureFont()).toBe('assets/fonts/arialbd.ttf');
      expect(fs.existsSync).toHaveBeenCalledWith('assets/fonts/arialbd.ttf');
    });

    it('creates dir if font does not exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === 'assets/fonts/arialbd.ttf') return false;
        return true;
      });
      ensureFont();
      expect(fs.mkdirSync).toHaveBeenCalledWith('assets/fonts', { recursive: true });
    });

    it('copies font on win32 if not exists', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === 'assets/fonts/arialbd.ttf') return false;
        if (p === 'C:/Windows/Fonts/arialbd.ttf') return true;
        return false;
      });
      expect(ensureFont()).toBe('assets/fonts/arialbd.ttf');
      expect(fs.copyFileSync).toHaveBeenCalledWith('C:/Windows/Fonts/arialbd.ttf', 'assets/fonts/arialbd.ttf');
    });

    it('handles error on copy in win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === 'assets/fonts/arialbd.ttf') return false;
        if (p === 'C:/Windows/Fonts/arialbd.ttf') return true;
        return false;
      });
      vi.mocked(fs.copyFileSync).mockImplementation(() => { throw new Error('copy error'); });
      expect(ensureFont()).toBe('assets/fonts/arialbd.ttf');
      expect(logger.warn).toHaveBeenCalledWith(expect.anything(), 'Falha ao copiar a fonte');
      expect(logger.warn).toHaveBeenCalledWith('Não foi possível copiar automaticamente a fonte Arial.');
    });

    it('copies font on non-win32 using msttcorefonts', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === 'assets/fonts/arialbd.ttf') return false;
        if (p === '/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf') return true;
        return false;
      });
      expect(ensureFont()).toBe('assets/fonts/arialbd.ttf');
      expect(fs.copyFileSync).toHaveBeenCalledWith('/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf', 'assets/fonts/arialbd.ttf');
    });

    it('copies font on non-win32 using candidates', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === 'assets/fonts/arialbd.ttf') return false;
        if (p === '/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf') return false;
        if (p === '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') return false;
        if (p === '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf') return true;
        return false;
      });
      expect(ensureFont()).toBe('assets/fonts/arialbd.ttf');
      expect(fs.copyFileSync).toHaveBeenCalledWith('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 'assets/fonts/arialbd.ttf');
    });

    it('returns false for tryCopy when fs throws an error for some reason', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === 'assets/fonts/arialbd.ttf') return false;
        if (p === '/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf') throw new Error('e');
        return false;
      });
      expect(ensureFont()).toBe('assets/fonts/arialbd.ttf');
    });

    it('warns if font cannot be copied on non-win32', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(ensureFont()).toBe('assets/fonts/arialbd.ttf');
      expect(logger.warn).toHaveBeenCalledWith('Não foi possível copiar automaticamente a fonte Arial.');
    });

    it('handles exactly correct copy return true branches on candidates', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === 'assets/fonts/arialbd.ttf') return false;
        if (p === '/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf') return false;
        if (p === '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') return true;
        return false;
      });
      expect(ensureFont()).toBe('assets/fonts/arialbd.ttf');
      expect(fs.copyFileSync).toHaveBeenCalledWith('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'assets/fonts/arialbd.ttf');
    });
  });

  describe('prepareBackground', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns gradient video if render succeeds', () => {
      vi.mocked(child_process.spawnSync).mockReturnValue({ status: 0 } as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const bg = prepareBackground('tmp', 60);
      expect(bg).toBe(path.join('tmp', 'bg_gradient.mp4'));
      expect(child_process.spawnSync).toHaveBeenCalledWith('ffmpeg', expect.any(Array));
    });

    it('returns existing fallback image if render fails', () => {
      vi.mocked(child_process.spawnSync).mockReturnValue({ status: 1, stderr: Buffer.from('err') } as any);
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const fp = typeof p === 'string' ? p : p.toString();
        return fp.includes('neon.png');
      });
      const bg = prepareBackground('tmp', 60);
      expect(bg).toBe(path.resolve('assets/backgrounds/neon.png'));
      expect(logger.warn).toHaveBeenCalledWith({ stderr: 'err' }, 'Fundo animado falhou — usando fallback estático');
    });

    it('generates fallback image if neon.png does not exist', () => {
      vi.mocked(child_process.spawnSync).mockReturnValue({ status: 1, stderr: Buffer.from('err') } as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const bg = prepareBackground('tmp', 60);
      expect(bg).toBe(path.join('tmp', 'bg_default.jpg'));
      expect(child_process.spawnSync).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining(['color=c=darkblue:s=1080x1920:d=1']));
    });

    it('uses generated fallback image if already exists', () => {
      vi.mocked(child_process.spawnSync).mockReturnValue({ status: 1, stderr: Buffer.from('err') } as any);
      vi.mocked(fs.existsSync).mockImplementation((p) => p === path.join('tmp', 'bg_default.jpg'));
      const bg = prepareBackground('tmp', 60);
      expect(bg).toBe(path.join('tmp', 'bg_default.jpg'));
      expect(child_process.spawnSync).toHaveBeenCalledTimes(1); // Only for bg_gradient
    });

    it('handles undefined stderr', () => {
      vi.mocked(child_process.spawnSync).mockReturnValue({ status: 1, stderr: undefined } as any);
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const fp = typeof p === 'string' ? p : p.toString();
        return fp.includes('neon.png');
      });
      const bg = prepareBackground('tmp', 60);
      expect(bg).toBe(path.resolve('assets/backgrounds/neon.png'));
      expect(logger.warn).toHaveBeenCalledWith({ stderr: undefined }, 'Fundo animado falhou — usando fallback estático');
    });
  });

  describe('prepareTextFiles', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });
    it('creates text files for questions, outro and hook', () => {
      const quiz = {
        perguntas: [
          { pergunta: 'q1', opcoes: { A: 'A', B: 'B', C: 'C', D: 'D' } },
        ],
        fato_curioso: 'fato',
        hook: 'hook'
      } as any;
      const res = prepareTextFiles(quiz, 'tmp');
      expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('tmp', 'q0.txt'), 'q1');
      expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('tmp', 'q0optA.txt'), 'A) A');
      expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('tmp', 'outro.txt'), 'fato');
      expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('tmp', 'hook.txt'), 'HOOK');
      expect(res.questions.length).toBe(1);
    });
  });
});
