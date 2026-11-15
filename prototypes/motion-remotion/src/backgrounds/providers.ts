import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {Candidate} from './types';

export type Fetch = typeof fetch;
export interface Provider {
  name: string;
  search(query: string): Promise<Candidate[]>;
}

const slugTags = (url = '') => (url.split('/').filter(Boolean).pop() ?? '').split('-').filter((w) => !/^\d+$/.test(w));
const splitTags = (tags = '') => tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

async function getJson<T>(fetchFn: Fetch, url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetchFn(url, {headers});
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return (await res.json()) as T;
}

interface PexelsVideoFile { file_type: string; width: number; height: number; link: string }
export function pexelsVideos(key: string, fetchFn: Fetch = fetch): Provider {
  return {
    name: 'pexels-video',
    async search(query) {
      const q = new URLSearchParams({query, orientation: 'portrait', per_page: '15'});
      const body = await getJson<{videos: {id: number; url: string; duration: number; user?: {name: string}; video_files: PexelsVideoFile[]}[]}>(
        fetchFn, `https://api.pexels.com/videos/search?${q}`, {Authorization: key});
      return body.videos.flatMap((v) => {
        const file = v.video_files.filter((f) => f.file_type === 'video/mp4' && f.width && f.height)
          .sort((a, b) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080))[0];
        return file ? [{provider: 'pexels-video', id: `pexels-v-${v.id}`, kind: 'video' as const, url: file.link, width: file.width,
          height: file.height, durationSec: v.duration, tags: slugTags(v.url), author: v.user?.name, pageUrl: v.url, license: 'Pexels License'}] : [];
      });
    },
  };
}

export function pexelsPhotos(key: string, fetchFn: Fetch = fetch): Provider {
  return {
    name: 'pexels-photo',
    async search(query) {
      const q = new URLSearchParams({query, orientation: 'portrait', per_page: '15'});
      const body = await getJson<{photos: {id: number; width: number; height: number; url: string; alt?: string; photographer?: string; src: {original: string; large2x: string}}[]}>(
        fetchFn, `https://api.pexels.com/v1/search?${q}`, {Authorization: key});
      return body.photos.map((p) => ({provider: 'pexels-photo', id: `pexels-p-${p.id}`, kind: 'photo' as const, url: p.src.large2x ?? p.src.original,
        width: p.width, height: p.height, tags: [...slugTags(p.url), ...(p.alt ?? '').toLowerCase().split(/\W+/)].filter(Boolean),
        author: p.photographer, pageUrl: p.url, license: 'Pexels License'}));
    },
  };
}

export function pixabay(key: string, kind: 'photo' | 'video', fetchFn: Fetch = fetch): Provider {
  return {
    name: `pixabay-${kind}`,
    async search(query) {
      const q = new URLSearchParams({key, q: query, per_page: '20', safesearch: 'true', ...(kind === 'photo' ? {orientation: 'vertical', image_type: 'photo'} : {})});
      const url = `https://pixabay.com/api/${kind === 'video' ? 'videos/' : ''}?${q}`;
      const body = await getJson<{hits: {id: number; pageURL: string; tags: string; user?: string; duration?: number; imageWidth?: number; imageHeight?: number; largeImageURL?: string; videos?: Record<string, {url: string; width: number; height: number}>}[]}>(fetchFn, url);
      return body.hits.flatMap((h) => {
        const file = kind === 'video' ? (h.videos?.large?.url ? h.videos.large : h.videos?.medium) : {url: h.largeImageURL ?? '', width: h.imageWidth ?? 0, height: h.imageHeight ?? 0};
        return file?.url ? [{provider: `pixabay-${kind}`, id: `pixabay-${kind[0]}-${h.id}`, kind, url: file.url, width: file.width, height: file.height,
          durationSec: h.duration, tags: splitTags(h.tags), author: h.user, pageUrl: h.pageURL, license: 'Pixabay Content License'}] : [];
      });
    },
  };
}

export function unsplash(key: string, fetchFn: Fetch = fetch): Provider {
  return {
    name: 'unsplash',
    async search(query) {
      const q = new URLSearchParams({query, orientation: 'portrait', per_page: '15', content_filter: 'high'});
      const body = await getJson<{results: {id: number; width: number; height: number; alt_description?: string; description?: string; urls: {regular: string; full: string}; links: {html: string}; user?: {name: string}}[]}>(
        fetchFn, `https://api.unsplash.com/search/photos?${q}`, {Authorization: `Client-ID ${key}`});
      return body.results.map((r) => ({provider: 'unsplash', id: `unsplash-${r.id}`, kind: 'photo' as const, url: r.urls.full, width: r.width, height: r.height,
        tags: `${r.alt_description ?? ''} ${r.description ?? ''}`.toLowerCase().split(/\W+/).filter(Boolean), author: r.user?.name, pageUrl: r.links.html, license: 'Unsplash License'}));
    },
  };
}

const MEDIA = /\.(mp4|mov|webm|jpe?g|png|webp)$/i;
/** Own library (like BROLL_DIR): files are named after what they show, e.g. `london-street-night.mp4`. */
export function localLibrary(dir: string, probe = probeSize): Provider {
  return {
    name: 'local',
    async search() {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter((f) => MEDIA.test(f)).map((f) => {
        const file = path.join(dir, f);
        const {width, height, durationSec} = probe(file);
        return {provider: 'local', id: `local-${f}`, kind: /\.(mp4|mov|webm)$/i.test(f) ? ('video' as const) : ('photo' as const),
          url: file, width, height, durationSec, tags: f.replace(MEDIA, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), license: 'own library'};
      });
    },
  };
}

export function probeSize(file: string): {width: number; height: number; durationSec?: number} {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]).toString();
    const json = JSON.parse(out) as {streams?: {width: number; height: number}[]; format?: {duration?: string}};
    const d = Number(json.format?.duration);
    return {width: json.streams?.[0]?.width ?? 0, height: json.streams?.[0]?.height ?? 0, durationSec: Number.isFinite(d) && d > 0.5 ? d : undefined};
  } catch {
    return {width: 0, height: 0};
  }
}

/** Every provider whose key is set, own library first. */
export function providersFromEnv(env = process.env, fetchFn: Fetch = fetch): Provider[] {
  const list: Provider[] = [];
  if (env.BACKGROUND_DIR) list.push(localLibrary(env.BACKGROUND_DIR));
  if (env.PEXELS_API_KEY) list.push(pexelsVideos(env.PEXELS_API_KEY, fetchFn), pexelsPhotos(env.PEXELS_API_KEY, fetchFn));
  if (env.PIXABAY_API_KEY) list.push(pixabay(env.PIXABAY_API_KEY, 'video', fetchFn), pixabay(env.PIXABAY_API_KEY, 'photo', fetchFn));
  if (env.UNSPLASH_ACCESS_KEY) list.push(unsplash(env.UNSPLASH_ACCESS_KEY, fetchFn));
  return list;
}
