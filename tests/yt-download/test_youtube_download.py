"""Tests to validate YouTube video download using cookies."""
import os
import tempfile

import pytest
import yt_dlp


COOKIES_FILE = os.path.join(
    os.path.dirname(__file__), "..", "..", "cookies.txt"
)
VIDEO_ID = "Ee1cIuT179o"
VIDEO_URL = f"https://www.youtube.com/watch?v={VIDEO_ID}"


@pytest.fixture
def download_dir():
    """Create a temporary directory for downloads."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


def _base_opts(**overrides):
    """Build yt-dlp options with sensible defaults."""
    opts = {
        "cookiefile": COOKIES_FILE,
        "quiet": True,
        "no_warnings": True,
        "js_runtimes": {"node": {}},
    }
    opts.update(overrides)
    return opts


class TestCookiesFile:
    """Validate cookies.txt format and presence."""

    def test_cookies_file_exists(self):
        assert os.path.isfile(COOKIES_FILE), (
            f"cookies.txt not found at {COOKIES_FILE}"
        )

    def test_cookies_file_is_netscape_format(self):
        with open(COOKIES_FILE, "r", encoding="utf-8") as f:
            first_line = f.readline().strip()
        assert "Netscape" in first_line or first_line.startswith("#")

    def test_cookies_contain_youtube_domain(self):
        with open(COOKIES_FILE, "r", encoding="utf-8") as f:
            content = f.read()
        assert ".youtube.com" in content


class TestVideoMetadata:
    """Validate that we can extract video info using cookies."""

    @pytest.fixture(autouse=True)
    def _extract_info(self):
        """Extract info once and share across tests in class."""
        opts = _base_opts(skip_download=True)
        with yt_dlp.YoutubeDL(opts) as ydl:
            self.info = ydl.extract_info(VIDEO_URL, download=False)

    def test_extract_video_info(self):
        assert self.info is not None
        assert self.info.get("id") == VIDEO_ID

    def test_video_has_title(self):
        assert self.info.get("title"), "Video title should not be empty"

    def test_video_has_formats(self):
        formats = self.info.get("formats", [])
        assert len(formats) > 0, "Video should have available formats"

    def test_video_has_audio_and_video_streams(self):
        formats = self.info.get("formats", [])
        has_video = any(
            f.get("vcodec", "none") != "none" for f in formats
        )
        has_audio = any(
            f.get("acodec", "none") != "none" for f in formats
        )
        assert has_video, "Should have at least one video stream"
        assert has_audio, "Should have at least one audio stream"


class TestVideoDownload:
    """Validate actual video download."""

    def test_download_video(self, download_dir):
        output_template = os.path.join(download_dir, "%(id)s.%(ext)s")
        opts = _base_opts(outtmpl=output_template)

        with yt_dlp.YoutubeDL(opts) as ydl:
            result = ydl.download([VIDEO_URL])

        assert result == 0, "Download should succeed (return code 0)"

        downloaded = [
            f for f in os.listdir(download_dir) if VIDEO_ID in f
        ]
        assert len(downloaded) > 0, "Downloaded file should exist"

        file_path = os.path.join(download_dir, downloaded[0])
        file_size = os.path.getsize(file_path)
        assert file_size > 10_000, (
            f"File too small ({file_size} bytes), not a valid video"
        )

    def test_download_audio_only(self, download_dir):
        output_template = os.path.join(
            download_dir, "%(id)s_audio.%(ext)s"
        )
        opts = _base_opts(
            format="bestaudio",
            outtmpl=output_template,
        )

        with yt_dlp.YoutubeDL(opts) as ydl:
            result = ydl.download([VIDEO_URL])

        assert result == 0, "Audio download should succeed"

        downloaded = [
            f for f in os.listdir(download_dir)
            if VIDEO_ID in f and "audio" in f
        ]
        assert len(downloaded) > 0, "Audio file should exist"
