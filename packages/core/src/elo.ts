/**
 * Standard Elo rating calculation.
 * K-factor varies by experience: K=32 for new players (<30 games), K=16 for established.
 */

const K_NEW = 32;
const K_ESTABLISHED = 16;
const NEW_PLAYER_THRESHOLD = 30;
const RATING_FLOOR = 100;

export interface EloResult {
  newRatingA: number;
  newRatingB: number;
  changeA: number;
  changeB: number;
}

export type MatchOutcome = "win_a" | "win_b" | "draw";

function getKFactor(gamesPlayed: number): number {
  return gamesPlayed < NEW_PLAYER_THRESHOLD ? K_NEW : K_ESTABLISHED;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function calculateElo(
  ratingA: number,
  ratingB: number,
  gamesPlayedA: number,
  gamesPlayedB: number,
  outcome: MatchOutcome
): EloResult {
  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;

  let scoreA: number;
  let scoreB: number;
  switch (outcome) {
    case "win_a":
      scoreA = 1;
      scoreB = 0;
      break;
    case "win_b":
      scoreA = 0;
      scoreB = 1;
      break;
    case "draw":
      scoreA = 0.5;
      scoreB = 0.5;
      break;
  }

  const kA = getKFactor(gamesPlayedA);
  const kB = getKFactor(gamesPlayedB);

  const changeA = Math.round(kA * (scoreA - expectedA));
  const changeB = Math.round(kB * (scoreB - expectedB));

  return {
    newRatingA: Math.max(RATING_FLOOR, ratingA + changeA),
    newRatingB: Math.max(RATING_FLOOR, ratingB + changeB),
    changeA,
    changeB,
  };
}
