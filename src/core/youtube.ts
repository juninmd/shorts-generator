// Barrel module — yt-dlp interactions split across focused files to honor the
// 150-line-per-file constraint. Public API is unchanged.
import * as youtubeInfo from "./youtube-info.js";
export const verifyYoutubeAccess = youtubeInfo.verifyYoutubeAccess;
export const getVideoInfo = youtubeInfo.getVideoInfo;
export const getVideoFileSize = youtubeInfo.getVideoFileSize;

import * as youtubeChannel from "./youtube-channel.js";
export const getChannelVideos = youtubeChannel.getChannelVideos;
export const getTopChannelVideos = youtubeChannel.getTopChannelVideos;

import * as youtubeDownload from "./youtube-download.js";
export const downloadAudioOnly = youtubeDownload.downloadAudioOnly;

import * as youtubeSection from "./youtube-section.js";
export const downloadVideoSection = youtubeSection.downloadVideoSection;
export const cleanupVideo = youtubeSection.cleanupVideo;
