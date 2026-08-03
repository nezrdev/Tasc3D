export const CONTENT_REVEAL_SCALE = 1.15;
export const CONTENT_REVEAL_LAG = 0.08;
export const revealTime = (seconds: number) => seconds * CONTENT_REVEAL_SCALE;
// Card and block reveals read too quick on the client pass; they run 30% slower.
export const CARD_REVEAL_SLOWDOWN = 1.3;
export const cardRevealTime = (seconds: number) => revealTime(seconds) * CARD_REVEAL_SLOWDOWN;
