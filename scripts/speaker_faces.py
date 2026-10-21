"""Face finder for the speaker tracker: YuNet (DNN) with a Haar-cascade fallback.

YuNet (assets/models, MIT, 230 KB) finds small, side-on and headphone-wearing
faces that the frontal Haar cascade misses in wide podcast shots, and its
landmarks place the mouth precisely. Without the model file, or on an OpenCV
build lacking FaceDetectorYN, the Haar cascade is used instead.
"""
import os

MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets",
                     "models", "face_detection_yunet_2023mar.onnx")
MIN_RELATIVE_WIDTH = 0.45
SCORE = 0.5


def _mouth_from_landmarks(row):
    x, y, w, h = row[:4]
    (rx, ry), (lx, ly) = (row[10], row[11]), (row[12], row[13])
    mw = max(abs(lx - rx) * 1.6, w * 0.3)
    mh = mw * 0.5
    return (int((rx + lx) / 2 - mw / 2), int((ry + ly) / 2 - mh / 2), int(mw), int(mh))


def _mouth_from_box(box):
    x, y, w, h = box
    return (x + int(w * 0.2), y + int(h * 0.6), int(w * 0.6), int(h * 0.4))


class FaceFinder:
    def __init__(self, cv2):
        self.cv2 = cv2
        self.yunet = None
        self.haar = None
        if os.path.exists(MODEL) and hasattr(cv2, "FaceDetectorYN"):
            try:
                self.yunet = cv2.FaceDetectorYN.create(MODEL, "", (320, 320), SCORE, 0.3, 50)
            except Exception:
                self.yunet = None
        if self.yunet is None:
            cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
            self.haar = None if cascade.empty() else cascade

    @property
    def available(self):
        return self.yunet is not None or self.haar is not None

    def find(self, bgr):
        """[(face_box, mouth_box)] in pixels, small false positives removed."""
        height, width = bgr.shape[:2]
        if self.yunet is not None:
            self.yunet.setInputSize((width, height))
            _, rows = self.yunet.detect(bgr)
            found = [] if rows is None else [
                ((int(r[0]), int(r[1]), int(r[2]), int(r[3])), _mouth_from_landmarks(r))
                for r in rows]
        else:
            gray = self.cv2.cvtColor(bgr, self.cv2.COLOR_BGR2GRAY)
            boxes = self.haar.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(max(24, width // 40),) * 2)
            found = [(tuple(int(v) for v in b), _mouth_from_box(b)) for b in boxes]
        if not found:
            return []
        widest = max(face[2] for face, _ in found)
        return [f for f in found if f[0][2] >= MIN_RELATIVE_WIDTH * widest]
