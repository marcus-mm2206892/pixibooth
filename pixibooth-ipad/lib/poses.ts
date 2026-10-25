// Pose prompts shown during each countdown. Shown in the app only, never printed.

/** Shown if a prompt is missing for any reason; capture never depends on it. */
export const FALLBACK_POSE = "GET READY TO POSE!";

// Grouped so each session mixes moods: cute, cheeky, stylish, then a freestyle finish.
// No props, jumping or leaving the frame.
const CUTE = [
  "PEACE SIGNS UP!",
  "FINGER HEARTS!",
  "HANDS ON YOUR CHEEKS!",
  "BIGGEST SMILES!",
  "MAKE A LITTLE STAR!",
];
const CHEEKY = [
  "SILLY FACES, GO!",
  "ACT SURPRISED!",
  "LOOK AT YOUR BESTIE!",
  "MATCH YOUR FRIEND'S FACE!",
  "BUNNY EARS FOR A FRIEND!",
  "WINK IF YOU CAN!",
];
const STYLISH = [
  "COOL ID PHOTO FACE",
  "PRETEND YOU'RE FAMOUS!",
  "MAIN CHARACTER MOMENT",
  "LOOK LEFT TOGETHER!",
  "SMILE LIKE IT'S YEARBOOK DAY!",
];
const FREESTYLE = [
  "FINAL SHOT: SURPRISE US!",
  "GROUP HUDDLE!",
  "EVERYONE POINT UP!",
  "COVER ONE EYE!",
];

export const POSE_CATALOG = [...CUTE, ...CHEEKY, ...STYLISH, ...FREESTYLE];

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)];
}

/** Distinct prompts: cute/cheeky/stylish in random order, freestyle last. */
export function pickPoses(count: number, rand: () => number = Math.random): string[] {
  const moods = [CUTE, CHEEKY, STYLISH];
  for (let i = moods.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [moods[i], moods[j]] = [moods[j], moods[i]];
  }
  const groups = [...moods, FREESTYLE];
  const chosen: string[] = [];
  for (let i = 0; i < count; i++) {
    const group = groups[Math.min(i, groups.length - 1)].filter((p) => !chosen.includes(p));
    chosen.push(pick(group.length ? group : POSE_CATALOG.filter((p) => !chosen.includes(p)), rand));
  }
  return chosen;
}
