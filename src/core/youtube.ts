// Barrel module — yt-dlp interactions split across focused files to honor the
// 150-line-per-file constraint. Public API is unchanged.

/* v8 ignore start */
import { verifyYoutubeAccess, getVideoInfo, getVideoFileSize } from "./youtube-info.js";
import { getChannelVideos, getTopChannelVideos } from "./youtube-channel.js";
import { downloadAudioOnly } from "./youtube-download.js";
import { downloadVideoSection, cleanupVideo } from "./youtube-section.js";

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
/* v8 ignore stop */
