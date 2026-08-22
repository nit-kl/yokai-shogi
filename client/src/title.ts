import { YOKAI } from '../../shared/data';
import { $ } from './util';
import { pickTitleLayout, TITLE_HEROES, type TitleHeroId } from './title-heroes';

export { TITLE_HEROES } from './title-heroes';

const TITLE_BG_CANDIDATES = ['/assets/ui/title-bg.webp', '/assets/ui/title-bg.png'];
const TITLE_LOGO_CANDIDATES = ['/assets/ui/title-logo.webp', '/assets/ui/title-logo.png'];
const TITLE_MOON_CANDIDATES = ['/assets/ui/title-moon.webp', '/assets/ui/title-moon.png'];
const TITLE_PORTRAITS: Record<TitleHeroId, string[]> = {
  kyubi: ['/assets/ui/title-kyubi.png', '/assets/ui/title-kyubi.webp'],
  ibaraki: ['/assets/ui/title-ibaraki.png', '/assets/ui/title-ibaraki.webp'],
  tamamo: ['/assets/ui/title-tamamo.png', '/assets/ui/title-tamamo.webp'],
};

const portraitUrl: Partial<Record<TitleHeroId, string>> = {};
let layout = pickTitleLayout();
let artProbed = false;
let artReady: Promise<void> | null = null;

function probeImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function firstExisting(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    if (await probeImage(url)) return url;
  }
  return null;
}

/** 用意されたキーアートがあればタイトルに載せる。無い場合は既存の駒絵で成立させる */
export function applyOptionalTitleArt(): Promise<void> {
  if (!artReady) artReady = loadOptionalTitleArt();
  return artReady;
}

async function loadOptionalTitleArt(): Promise<void> {
  if (artProbed) return;
  artProbed = true;
  const screen = $('screen-title');
  const [bg, logo, moon, kyubi, ibaraki, tamamo] = await Promise.all([
    firstExisting(TITLE_BG_CANDIDATES),
    firstExisting(TITLE_LOGO_CANDIDATES),
    firstExisting(TITLE_MOON_CANDIDATES),
    firstExisting(TITLE_PORTRAITS.kyubi),
    firstExisting(TITLE_PORTRAITS.ibaraki),
    firstExisting(TITLE_PORTRAITS.tamamo),
  ]);
  if (bg) {
    const sky = screen.querySelector<HTMLElement>('.title-sky');
    if (sky) sky.style.backgroundImage = `url("${bg}")`;
    screen.classList.add('has-title-bg');
  }
  if (logo) {
    const logoEl = $<HTMLImageElement>('title-logo-art');
    logoEl.src = logo;
    logoEl.classList.remove('hidden');
    screen.classList.add('has-title-logo');
  }
  if (moon) {
    const moonEl = screen.querySelector<HTMLElement>('.title-moon');
    if (moonEl) {
      moonEl.style.backgroundImage = `url("${moon}")`;
      moonEl.style.backgroundSize = 'contain';
      moonEl.style.backgroundRepeat = 'no-repeat';
      moonEl.style.backgroundPosition = 'center';
      moonEl.classList.add('has-moon-art');
    }
  }
  if (kyubi) portraitUrl.kyubi = kyubi;
  if (ibaraki) portraitUrl.ibaraki = ibaraki;
  if (tamamo) portraitUrl.tamamo = tamamo;
  if (kyubi || ibaraki || tamamo) screen.classList.add('has-title-portraits');
}

function portraitSrc(id: TitleHeroId): string {
  return portraitUrl[id] || YOKAI[id].img;
}

function placeHero(elementId: string, heroId: TitleHeroId): void {
  const image = $<HTMLImageElement>(elementId);
  image.src = portraitSrc(heroId);
  image.alt = YOKAI[heroId].name;
}

/** タイトルの顔。選んだ大将ではなく、九尾 / 茨木 / 玉藻をセッション中は固定で出す */
export function renderTitleHeroes(): void {
  placeHero('title-boss-c', layout.center);
  placeHero('title-boss-l', layout.left);
  placeHero('title-boss-r', layout.right);
}
