import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./src/index.ts");
Config.setVideoImageFormat("jpeg");
// lyric videos have big flat colours and sharp text edges — a slightly higher quality avoids banding
Config.setCrf(18);
Config.setPixelFormat("yuv420p");
