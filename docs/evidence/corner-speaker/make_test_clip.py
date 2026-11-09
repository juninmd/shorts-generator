import cv2, sys, numpy as np
sys.path.insert(0, '/home/user/shorts-generator/scripts')
from skimage import data
W, H, FPS, SECS = 1280, 720, 25, 10
src = cv2.cvtColor(data.astronaut(), cv2.COLOR_RGB2BGR)  # 512px, face ~94px wide

def face_patch(scale):
    im = cv2.resize(src, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    return im

def paste(canvas, patch, cx, cy):
    h, w = patch.shape[:2]
    x0, y0 = cx - w // 2, cy - h // 2
    canvas[y0:y0+h, x0:x0+w] = patch

def build(out, corner_scale, big_scale=2.6, corner_talks=True):
    big = face_patch(big_scale)
    small = face_patch(corner_scale)
    # the face inside the 512 image is around x 276..370, y 165..278 (scale 1)
    fx, fy = 323, 221  # face centre in source
    bigc = big.shape[0]
    # crop tight around face so the patch is the face itself
    def tight(scale):
        im = face_patch(scale)
        s = scale
        x0, y0 = int((fx-110)*s), int((fy-120)*s)
        x1, y1 = int((fx+110)*s), int((fy+130)*s)
        return im[y0:y1, x0:x1]
    bigp, smallp = tight(big_scale), tight(corner_scale)
    vw = cv2.VideoWriter(out, cv2.VideoWriter_fourcc(*'mp4v'), FPS, (W, H))
    rng = np.random.default_rng(0)
    probe = np.full((H, W, 3), (70, 40, 20), np.uint8)
    paste(probe, bigp, 420, 330); paste(probe, smallp, 1080, 440)
    from speaker_faces import FaceFinder
    faces = [f for f in FaceFinder(cv2).find(probe) if f[0][0] > 700]
    mouth_box = faces[0][1]
    bg = np.full((H, W, 3), (70, 40, 20), np.uint8)
    for f in range(FPS * SECS):
        frame = bg.copy()
        # static big "screen" person on the left-centre
        paste(frame, bigp, 420, 330)
        cf = smallp.copy()
        if corner_talks:
            mx, my, mw, mh = mouth_box
            y0, y1 = my, my + mh
            x0, x1 = mx, mx + mw
            cf = cf  # noise applied on the frame (mouth box in frame coords)
        paste(frame, cf, 1080, 440)
        if corner_talks:
            mx, my, mw, mh = mouth_box
            reg = frame[my:my+mh, mx:mx+mw].astype(int)
            frame[my:my+mh, mx:mx+mw] = np.clip(reg + rng.integers(-60, 60, (mh, mw, 1)), 0, 255).astype(np.uint8)
        vw.write(frame)
    vw.release()

if __name__ == "__main__":
    build(sys.argv[1], float(sys.argv[2]), corner_talks=True)
