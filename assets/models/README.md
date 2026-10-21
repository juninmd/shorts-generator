# Models

`face_detection_yunet_2023mar.onnx` — YuNet face detector (230 KB), used by `scripts/speaker_faces.py`
for speaker tracking. Source: <https://huggingface.co/opencv/face_detection_yunet> (OpenCV Zoo,
MIT licence, libfacedetection by Shiqi Yu). SHA-256
`8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`. Without it the tracker falls
back to the Haar cascade bundled with OpenCV.
