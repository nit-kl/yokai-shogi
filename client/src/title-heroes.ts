export const TITLE_HEROES = ['kyubi', 'ibaraki', 'tamamo'] as const;
export type TitleHeroId = typeof TITLE_HEROES[number];

/** タイトル中央の1体と、左右の控え。同じセッションでは変えない */
export function pickTitleLayout(rand = Math.random): {
  center: TitleHeroId;
  left: TitleHeroId;
  right: TitleHeroId;
} {
  const center = TITLE_HEROES[Math.floor(rand() * TITLE_HEROES.length)]!;
  const rest = TITLE_HEROES.filter(id => id !== center);
  if (rand() < 0.5) rest.reverse();
  return { center, left: rest[0]!, right: rest[1]! };
}
