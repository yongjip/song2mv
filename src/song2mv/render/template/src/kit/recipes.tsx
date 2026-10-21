import React from "react";
import { Flash, Svg } from "./backgrounds";
import { Camera } from "./camera";
import { City } from "./city";
import { Rain } from "./effects";
import { Person, personEye } from "./people";
import { Room } from "./room";
import { SkyGradient } from "./sky";
import { Storm, strikeFlashes } from "./storm";
import { Tears } from "./tears";

/**
 * Recipes: new assets made by combining the kit's parts, a few lines each. The parts fit together by shared
 * conventions: the 1920×1080 stage, s = 1 for a Person 300 px tall, y on the line things stand on, anchors such as
 * personHand() and personEye(), a lightning strike's `to`, Flames on a point or FlamesAlong an edge, and colours as
 * props. A recipe is an asset like any other: new ones are welcome as pull requests (CONTRIBUTING.md).
 */

/**
 * Sleepless in a storm: someone lying awake in bed while a storm crosses the window, the room flashing with each
 * strike, a tear running from the eye to the pillow, the camera slowly closing in. Parts: Room with its Bed, Person
 * lying and personEye(), Tears, Storm and City and Rain in the window, Camera, Flash.
 * `strikes` and `tears` are song times (put them on beats and words); the push-in starts at `from`.
 */
export const SleeplessStorm: React.FC<{ T: number; strikes?: number[]; tears?: number[]; from?: number; id?: string }> = ({
  T, strikes = [], tears = [], from = 0, id = "sleepless",
}) => {
  const bolts = strikes.map((t, i) => ({ t, x: [700, 460, 580][i % 3] }));
  const [ex, ey] = personEye("lie", 1, 0, T);
  const sleeper = (
    <>
      <Person x={0} y={0} pose="lie" T={T} look={{ hair: "long", top: "#d8d0c0", hairColor: "#20160f" }} />
      <Tears T={T} x={ex} y={ey} s={1.8} times={tears} fall={-32} />
    </>
  );
  const view = (
    <>
      <SkyGradient time="night" id={`${id}-sky`} />
      <Storm T={T} strikes={bolts} y={300} ground={650} id={`${id}-storm`} />
      <City T={T} y={690} scale={0.45} id={`${id}-city`} />
      <Rain T={T} strength={0.7} angle={12} ground={690} id={`${id}-rain`} />
    </>
  );
  return (
    <>
      <Camera T={T} shots={[{ t: from, x: 960, y: 540, to: { x: 985, y: 590, zoom: 1.22 } }]}>
        <Svg>
          <Room T={T} bed sleeper={sleeper} view={view} id={`${id}-room`} />
        </Svg>
      </Camera>
      <Flash T={T} flashes={strikeFlashes(bolts, 0.12)} />
    </>
  );
};
