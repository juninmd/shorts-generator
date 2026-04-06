import cv2
import mediapipe as mp
import sys
import json

def detect_face_center(image_path):
    # Initialize MediaPipe Face Detection
    mp_face_detection = mp.solutions.face_detection
    
    image = cv2.imread(image_path)
    if image is None:
        return 0.5
    
    height, width, _ = image.shape
    
    with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as face_detection:
        results = face_detection.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        
        if not results.detections:
            return 0.5
        
        # Get the first face detected
        detection = results.detections[0]
        bbox = detection.location_data.relative_bounding_box
        
        # Calculate horizontal center
        center_x = bbox.xmin + (bbox.width / 2)
        return max(0.0, min(1.0, center_x))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"faceX": 0.5}))
        sys.exit(1)
        
    img_path = sys.argv[1]
    try:
        x = detect_face_center(img_path)
        print(json.dumps({"faceX": x}))
    except Exception as e:
        print(json.dumps({"faceX": 0.5, "error": str(e)}))
