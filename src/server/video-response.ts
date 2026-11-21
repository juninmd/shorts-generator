import fs from "node:fs";
import { Readable } from "node:stream";

/** Streams an mp4 from disk instead of buffering it whole, so memory stays flat under concurrent downloads. */
export function videoFileResponse(file: string, headers: Record<string, string>): Response {
  const { size } = fs.statSync(file);
  const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(body, {
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size), ...headers },
  });
}
