
// Barrel module — yt-dlp interactions split across focused files to honor the
// 150-line-per-file constraint. Public API is unchanged.
import * as __youtube_info_js from "./youtube-info.js";
export const verifyYoutubeAccess = __youtube_info_js.verifyYoutubeAccess;
export const getVideoInfo = __youtube_info_js.getVideoInfo;
export const getVideoFileSize = __youtube_info_js.getVideoFileSize;

import * as __youtube_channel_js from "./youtube-channel.js";
export const getChannelVideos = __youtube_channel_js.getChannelVideos;
export const getTopChannelVideos = __youtube_channel_js.getTopChannelVideos;

import * as __youtube_download_js from "./youtube-download.js";
export const downloadAudioOnly = __youtube_download_js.downloadAudioOnly;

import * as __youtube_section_js from "./youtube-section.js";
export const downloadVideoSection = __youtube_section_js.downloadVideoSection;
export const cleanupVideo = __youtube_section_js.cleanupVideo;

