import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Regression guard: the speaker tracker needs opencv in the Python that runs it.
// Without it track_speaker.py exits 1 silently and the crop falls back to centre.
const dockerfile = fs.readFileSync(path.resolve(__dirname, "../../Dockerfile"), "utf8");

describe("speaker tracking runtime (Docker image)", () => {
  it("installs opencv into the venv that is first on PATH", () => {
    expect(dockerfile).toMatch(/uv pip install "opencv-python-headless<5" --python tests\/yt-download\/\.venv/);
    expect(dockerfile).toMatch(/ENV PATH="\/app\/tests\/yt-download\/.venv\/bin:\$PATH"/);
  });

  it("fails the image build when cv2 cannot load face detection", () => {
    expect(dockerfile).toMatch(/import cv2; assert hasattr\(cv2, 'FaceDetectorYN'\)/);
  });
});
