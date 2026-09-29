import * as metadata from "./youtube-metadata.service.js";
import * as auth from "./youtube-auth.service.js";
import * as comment from "./youtube-comment.service.js";
import * as upload from "./youtube-upload.service.js";

export const generateYoutubeMetadata = metadata.generateYoutubeMetadata;
export const validateYouTubeToken = auth.validateYouTubeToken;
export const getYouTubeAuth = auth.getYouTubeAuth;
export const addCommentToVideo = comment.addCommentToVideo;
export const buildEngagementComment = comment.buildEngagementComment;
export const uploadToYouTube = upload.uploadToYouTube;
export const uploadFullVideoToYouTube = upload.uploadFullVideoToYouTube;
