import cv2
import mediapipe as mp
import sys
import json
import os

def detect_face_center(image_path):
    if not os.path.exists(image_path):
        return 0.5, "File not found"

    image = cv2.imread(image_path)
    if image is None:
        return 0.5, "Could not read image"

    height, width, _ = image.shape
    mp_face_detection = mp.solutions.face_detection

    best_detection = None
    best_score = 0.0

    # Try model_selection=0 (short-range, <2m) then model_selection=1 (full-range, <5m)
    for model_sel in [0, 1]:
        with mp_face_detection.FaceDetection(model_selection=model_sel, min_detection_confidence=0.4) as detector:
            results = detector.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
            if results.detections:
                for det in results.detections:
                    score = det.score[0] if det.score else 0.0
                    if score > best_score:
                        best_score = score
                        best_detection = det

        if best_detection is not None:
            break  # Found a face, no need to try the other model

    if best_detection is None:
        return 0.5, "No face detected"

    bbox = best_detection.location_data.relative_bounding_box
    center_x = bbox.xmin + (bbox.width / 2)
    return max(0.0, min(1.0, float(center_x))), f"Success (score: {best_score:.2f})"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"faceX": 0.5, "error": "No image path provided"}))
        sys.exit(1)

    img_path = sys.argv[1]
    try:
        x, msg = detect_face_center(img_path)
        print(json.dumps({"faceX": x, "message": msg}))
    except Exception as e:
        print(json.dumps({"faceX": 0.5, "error": str(e)}))
