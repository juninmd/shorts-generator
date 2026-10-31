import { verifyYoutubeAccess, getVideoInfo, getVideoFileSize } from "./youtube-info.js";
import { getChannelVideos, getTopChannelVideos } from "./youtube-channel.js";
import { downloadAudioOnly } from "./youtube-download.js";
import { downloadVideoSection, cleanupVideo } from "./youtube-section.js";

const youtube = {
    verifyYoutubeAccess,
    getVideoInfo,
    getVideoFileSize,
    getChannelVideos,
    getTopChannelVideos,
    downloadAudioOnly,
    downloadVideoSection,
    cleanupVideo
};

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
export default youtube;
