/* v8 ignore start */
// Barrel module — yt-dlp interactions split across focused files to honor the
// 150-line-per-file constraint. Public API is unchanged.
import { verifyYoutubeAccess, getVideoInfo, getVideoFileSize } from "./youtube-info.js";
import { getChannelVideos, getTopChannelVideos } from "./youtube-channel.js";
import { downloadAudioOnly } from "./youtube-download.js";
import { downloadVideoSection, cleanupVideo } from "./youtube-section.js";
/* v8 ignore stop */

export {
  verifyYoutubeAccess,
  getVideoInfo,
  getVideoFileSize,
  getChannelVideos,
  getTopChannelVideos,
  downloadAudioOnly,
  downloadVideoSection,
  cleanupVideo
};
