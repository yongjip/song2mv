# Security

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository.
Do not open a public issue.

song2mv runs locally. It reads the audio and lyric files you give it and runs `ffmpeg`/`ffprobe`. `sync` downloads
whisper models from Hugging Face on first use; `render` runs `npm ci` in its template folder and Remotion's bundled
headless Chrome. It has no accounts, servers or telemetry.
