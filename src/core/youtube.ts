
// Barrel module — yt-dlp interactions split across focused files to honor the
// 150-line-per-file constraint. Public API is unchanged.
export { verifyYoutubeAccess, getVideoInfo, getVideoFileSize } from "./youtube-info.js";
export { getChannelVideos, getTopChannelVideos } from "./youtube-channel.js";
export { downloadAudioOnly } from "./youtube-download.js";
export { downloadVideoSection, cleanupVideo } from "./youtube-section.js";
