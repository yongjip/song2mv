export * from "./math";
export * from "./song";
export * from "./color";
export * from "./backgrounds";
export * from "./text";
export * from "./sky";
export * from "./nature";
export * from "./city";
export * from "./room";
export * from "./people";
export * from "./crowd";
export * from "./portrait-body";
export * from "./portrait-cutout";
export * from "./portrait-motion";
export * from "./portrait-interaction";
export * from "./objects";
export * from "./phone";
export * from "./symbols";
export * from "./vehicles";
export * from "./effects";
export * from "./camera";
export * from "./font";
export { FaceCheck } from "./facecheck";
// Cut planning and storyboards: shots and boards whose cuts pass `song2mv check`
export { planShots, type Framing, type Plan, type PlanOptions, type PlannedShot } from "./plan";
export * from "./storyboard";
// tallView stays inside: pixel scenes reach it through pixel.cameraAt, which first steadies their shots
export { VERTICAL, WIDE, verticalView, wideView } from "./vertical";
export * from "./hit";
export * from "./flames";
export * from "./storm";
export * from "./tears";
export * from "./cash";
// Recipes: new assets combined from the parts above
export * from "./recipes";
// Style packs: drawing pieces that put any object in one art style, one namespace each (paper.Cut, pixel.Canvas …)
export * as paper from "./styles/paper";
export * as pixel from "./styles/pixel";
export * as comic from "./styles/comic";
export * as poster from "./styles/poster";
export * as toon from "./styles/toon";
export * as line from "./styles/line";
export * as paint from "./styles/paint";
export * as finish from "./styles/finish";
export * as anime from "./styles/anime";
