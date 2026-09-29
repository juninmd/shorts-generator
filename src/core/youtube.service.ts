import * as youtubeMetadata from "./youtube-metadata.service.js";
import * as youtubeAuth from "./youtube-auth.service.js";
import * as youtubeComment from "./youtube-comment.service.js";
import * as youtubeUpload from "./youtube-upload.service.js";

export const generateYoutubeMetadata = youtubeMetadata.generateYoutubeMetadata;

export const validateYouTubeToken = youtubeAuth.validateYouTubeToken;
export const getYouTubeAuth = youtubeAuth.getYouTubeAuth;

export const buildEngagementComment = youtubeComment.buildEngagementComment;
export const addCommentToVideo = youtubeComment.addCommentToVideo;

export const uploadToYouTube = youtubeUpload.uploadToYouTube;
export const uploadFullVideoToYouTube = youtubeUpload.uploadFullVideoToYouTube;
