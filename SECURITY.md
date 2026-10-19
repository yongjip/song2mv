# Security

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository.
Do not open a public issue.

song2mv runs locally. It reads the audio and lyric files you give it and runs `ffmpeg`/`ffprobe`. It has no
accounts, servers or telemetry. It goes online only for these downloads:

- `sync`, first use: the whisper model from Hugging Face (`small`: ~460 MB).
- `render`, first use per template folder: `npm ci` installs Remotion and its dependencies (~300 packages from the
  npm registry, pinned by the template's `package-lock.json`), then Remotion downloads Chrome Headless Shell from
  Google's Chrome for Testing storage. The render runs that Chrome locally to draw the frames.
