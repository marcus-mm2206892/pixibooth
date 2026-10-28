// Pose prompts shown during each countdown. Shown in the app only, never printed.

/** Shown if a prompt is missing for any reason; capture never depends on it. */
export const FALLBACK_POSE = "GET READY TO POSE!";

// Grouped so each session mixes moods: cute, cheeky, stylish, then a freestyle finish.
// No props, jumping or leaving the frame.
const CUTE = [
  "GIVE US YOUR CUTEST WINK!",
  "STRIKE A PEACE SIGN!",
  "MAKE A FINGER HEART!",
  "MAKE A HEART ♡!",
  "BLOW A KISS TO THE CAMERA!",
];

const CHEEKY = [
  "FLASH A CHEEKY SMILE!",
  "DO A MEME POSE!",
  "MAKE YOUR WACKIEST FACE!",
  "POINT AT THE FUNNIEST FRIEND!",
  "ACT TOTALLY SURPRISED!",
  "SHOW US YOUR CHAOTIC SIDE!",
  "GIVE US YOUR BEST SIDE-EYE!",
  "PRETEND YOU JUST HEARD SOME GOSSIP!",
  "DO A MUSTACHE POSE!",
];

const STYLISH = [
  "STRIKE YOUR SIGNATURE POSE!",
  "POSE LIKE A VOGUE MODEL!",
  "POSE LIKE A K-POP IDOL!",
  "POSE LIKE YOU'RE ON AN ALBUM COVER!",
];

const FREESTYLE = [
  "POSE LIKE A SUPERHERO!",
  "GIVE US YOUR BEST SALUTE!",
  "STRIKE YOUR BEST VILLAIN POSE!",
];

export const POSE_CATALOG = [...CUTE, ...CHEEKY, ...STYLISH, ...FREESTYLE];

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)];
}

/** Distinct prompts: cute/cheeky/stylish in random order, freestyle last. */
export function pickPoses(
  count: number,
  rand: () => number = Math.random,
): string[] {
  const moods = [CUTE, CHEEKY, STYLISH];
  for (let i = moods.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [moods[i], moods[j]] = [moods[j], moods[i]];
  }
  const groups = [...moods, FREESTYLE];
  const chosen: string[] = [];
  for (let i = 0; i < count; i++) {
    const group = groups[Math.min(i, groups.length - 1)].filter(
      (p) => !chosen.includes(p),
    );
    chosen.push(
      pick(
        group.length ? group : POSE_CATALOG.filter((p) => !chosen.includes(p)),
        rand,
      ),
    );
  }
  return chosen;
}
