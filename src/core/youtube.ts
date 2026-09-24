
// Barrel module — yt-dlp interactions split across focused files to honor the
// 150-line-per-file constraint. Public API is unchanged.
import * as info from "./youtube-info.js";
import * as channel from "./youtube-channel.js";
import * as download from "./youtube-download.js";
import * as section from "./youtube-section.js";

export const verifyYoutubeAccess = info.verifyYoutubeAccess;
export const getVideoInfo = info.getVideoInfo;
export const getVideoFileSize = info.getVideoFileSize;
export const getChannelVideos = channel.getChannelVideos;
export const getTopChannelVideos = channel.getTopChannelVideos;
export const downloadAudioOnly = download.downloadAudioOnly;
export const downloadVideoSection = section.downloadVideoSection;
export const cleanupVideo = section.cleanupVideo;

