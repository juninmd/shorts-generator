import cv2
import mediapipe as mp
import sys
import json
import os

def detect_face_center(image_path):
    # Initialize MediaPipe Face Detection
    mp_face_detection = mp.solutions.face_detection
    
    if not os.path.exists(image_path):
        return 0.5, "File not found"
        
    image = cv2.imread(image_path)
    if image is None:
        return 0.5, "Could not read image"
    
    height, width, _ = image.shape
    
    # model_selection=0 is better for close-range (within 2 meters), perfect for podcasts
    with mp_face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.4) as face_detection:
        results = face_detection.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        
        if not results.detections:
            return 0.5, "No face detected"
        
        # Get the first face detected (highest confidence)
        detection = results.detections[0]
        bbox = detection.location_data.relative_bounding_box
        
        # Calculate horizontal center
        center_x = bbox.xmin + (bbox.width / 2)
        
        # Debug info for logging
        score = detection.score[0] if detection.score else 0
        return max(0.0, min(1.0, float(center_x))), f"Success (score: {score:.2f})"

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
