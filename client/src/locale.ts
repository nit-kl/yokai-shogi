import { RESONANCES, YOKAI } from '../../shared/data';

/** Add a locale here (+ message tables) when shipping a new language. */
export type AppLocale = 'ja' | 'en';
type LocaleScript = 'jpan' | 'latn';

interface LocaleDefinition {
  id: AppLocale;
  /** BCP 47 tag for <html lang> */
  htmlLang: string;
  ogLocale: string;
  /** Label shown in the language picker, written in that language */
  nativeLabel: string;
  /** Drives typography via html[data-script], not a per-language CSS fork */
  script: LocaleScript;
  termsPath: string;
  privacyPath: string;
  /** Canonical DOM / server copy language. Other locales are projected overlays for now. */
  source?: boolean;
}

export const LOCALES: Record<AppLocale, LocaleDefinition> = {
  ja: {
    id: 'ja',
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    nativeLabel: '日本語',
    script: 'jpan',
    termsPath: '/legal/terms.html',
    privacyPath: '/legal/privacy.html',
    source: true,
  },
  en: {
    id: 'en',
    htmlLang: 'en',
    ogLocale: 'en_US',
    nativeLabel: 'English',
    script: 'latn',
    termsPath: '/legal/terms-en.html',
    privacyPath: '/legal/privacy-en.html',
  },
};

/** Enabled locales in picker order. Grow this list when adding languages. */
export const SUPPORTED_LOCALES: readonly AppLocale[] = ['ja', 'en'];

const SOURCE_LOCALE: AppLocale = 'ja';
const STORAGE_KEY = 'yokaiShogi.locale.v1';
const originals = new WeakMap<Node, string>();
const attributeOriginals = new WeakMap<Element, Map<string, string>>();
let locale: AppLocale = SOURCE_LOCALE;
let observer: MutationObserver | null = null;
let applying = false;

function isAppLocale(value: string | null | undefined): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function localeDef(id: AppLocale = locale): LocaleDefinition {
  return LOCALES[id];
}

const EN = new Map<string, string>();
const add = (ja: string, en: string): void => { if (ja) EN.set(ja, en); };

// Static UI copy. Text is keyed by the Japanese source so existing rendering code
// stays untouched and server/storage values never become locale-dependent.
const STATIC: Record<string, string> = {
  '百鬼盤｜妖怪を集めて、取って、HPを削る対戦ゲーム': 'Hyakkiban | Collect yokai, capture, and drain HP',
  '百鬼召喚中…': 'Summoning the Night Parade…',
  '初回登録の確認': 'Verifying your first visit',
  'メンテナンス中': 'Under Maintenance',
  'オンライン機能は一時停止しています。しばらくしてからお試しください。': 'Online features are temporarily unavailable. Please try again shortly.',
  '再試行': 'Try Again', 'ソロで遊ぶ': 'Play Solo', '妖力': 'Spirit Power',
  '音量設定': 'Audio Settings', 'プレイヤーネームを変更': 'Change player name',
  'プレイヤー': 'Player', '妖怪を集めて、取って、HPを削る対戦ゲーム': 'Collect yokai, capture, and drain HP',
  '妖怪': 'Yokai', '連勝に挑む': 'Build a win streak', '百鬼夜行': 'Night Parade',
  '猛者と競う': 'Face other players', 'オンライン対戦': 'Online Battle',
  '登録プレイヤー': 'Registered Players', '人': 'players', 'メニュー': 'Menu',
  '妖怪ガチャ': 'Yokai Summon', '編 成': 'Formation', '駒一覧': 'Compendium',
  'ランキング': 'Rankings', '遊び方': 'How to Play', 'お知らせ': 'News',
  '公式Discord': 'Official Discord', '遊び方ガイド': 'How-to Guide', '利用規約': 'Terms',
  'プライバシー': 'Privacy', 'お問い合わせ': 'Support', 'DMで報告': 'Report via DM',
  'データ引き継ぎ': 'Transfer Data', '戻る': 'Back', '現在の連勝': 'Current Streak',
  '今週ベスト': 'Weekly Best', '今週順位': 'Weekly Rank', '挑戦する': 'Start Challenge',
  '編成を整える': 'Edit Formation', '週間ランキング': 'Weekly Rankings', '次の軍勢': 'Next Army',
  '敵軍の編成': 'Enemy Formation', '開戦': 'Battle',
  '百鬼夜行で記録した、今週のベスト連勝数です。': 'Your best Night Parade win streak this week.',
  '今週の1位報酬': 'Weekly #1 Reward', '今週の百鬼夜行': "This Week's Night Parade",
  '連勝ランキング(月曜リセット)': 'Win Streak Rankings (resets Monday)',
  '名前を設定して名乗りを上げる': 'Set a name to enter the rankings', '先週の百鬼夜行': "Last Week's Night Parade",
  'チケットはログインボーナスや対戦報酬、任意の広告視聴などで手に入ります。': 'Earn tickets from login bonuses, battle rewards, and optional ads.',
  '1回召喚': 'Summon Once', 'チケット1枚': '1 Ticket', '10連召喚': 'Summon 10',
  '10枚・SR以上確定': '10 Tickets · SR+ guaranteed', '妖力300 → チケット1枚': '300 Spirit Power → 1 Ticket',
  '広告を見てチケット+1': 'Watch an Ad for +1 Ticket', '1日2回まで・任意視聴': 'Optional · Up to twice daily',
  '排出率: N 40% / R 40% / SR 16% / SSR 4%（うちSSR異装 0.5%）・ 被りは妖力に変換': 'Rates: N 40% / R 40% / SR 16% / SSR 4% (Alt SSR: 0.5%) · Duplicates become Spirit Power',
  '百鬼召喚': 'Night Parade Summon', '召喚結果': 'Summon Results', '保 存': 'Save',
  '⬆ 敵陣方向': '⬆ Enemy Side', '探す': 'Search', '駒名・能力で検索': 'Search by name or ability',
  '動き': 'Movement', '画像を拡大': 'Enlarge image', '閉じる': 'Close', 'タップで閉じる': 'Tap to close',
  '敵将': 'Enemy General', '自軍': 'Your Army', '覚醒': 'Awakening', '覚醒する': 'Awaken',
  '相手思考中…': 'Enemy is thinking…', '状': 'Status',
  '接続済み': 'Connected', '持ち時間': 'Time', '相手の再接続待ち': 'Waiting for opponent to reconnect',
  '対局ステータス': 'Battle Status', '月齢': 'Moon Phase', '新月': 'New Moon', '飢餓': 'Hunger',
  '飢餓まであと8': '8 moves until Hunger', '8手取りなしで飢餓の夜。以後毎手双方-50。駒を取るとリセット。': 'After 8 moves without a capture, the Night of Hunger begins. Both sides lose 50 HP each move; a capture resets it.',
  '投了': 'Resign', '駒の説明': 'Yokai details', '再 戦': 'Rematch',
  'タイトルへ': 'Title Screen', '次の軍勢へ': 'Face the Next Army', 'もう一度挑む': 'Try Again',
  'ロビーへ戻る': 'Return to Lobby', 'プロフィール': 'Profile', 'プレイヤーネーム': 'Player Name',
  '1〜10文字': '1–10 characters', 'オンライン対戦で相手に表示されます。名前は重複できます。': 'Shown to opponents in online battles. Names do not need to be unique.',
  '保存': 'Save', 'ミュート': 'Mute', '効果音': 'Sound Effects', '設定はこの端末に保存されます。': 'Settings are saved on this device.',
  '大将を選ぼう': 'Choose Your General', '登録なしで体験できます。最初に大将を1体選ぶと、すぐに仲間を集めて対局を始められます。': 'Play without registering. Choose one general, summon allies, and start battling right away.',
  'ログインボーナス': 'Login Bonus', '連続ログイン': 'Login Streak', '日目': 'days', 'ガチャチケット': 'Summon Ticket',
  '受け取る': 'Claim', '新妖怪追加記念': 'New Yokai Celebration', '新駒リリースをお祝いして': 'Celebrating a new yokai release',
  'お一人様1回・自動で付与されます': 'Granted automatically once per player',
  'オンライン機能の利用について': 'About Online Features', '利用規約を読む': 'Read the Terms of Service',
  'プライバシーポリシーを読む': 'Read the Privacy Policy', '同意してオンライン機能を利用': 'Accept and Use Online Features',
  '同意せずソロで遊ぶ': 'Decline and Play Solo', 'パスキーを登録': 'Register a Passkey',
  'パスキー登録済みです': 'Passkey registered', 'このデータのコードを発行': 'Create a Transfer Code',
  'コードで引き継ぐ': 'Transfer with Code', 'パスキーで切り替える': 'Switch with Passkey',
  'データを守りましょう': 'Protect Your Progress', 'コードを発行する': 'Create a Code', 'あとで': 'Later',
  'セッションが切れました': 'Session Expired', 'パスキーで復元': 'Restore with Passkey', 'コードで復元': 'Restore with Code',
  '新規に始める': 'Start Fresh', '対戦方法を選んでください': 'Choose how to battle',
  'ランダムマッチ': 'Random Match', 'AI対戦に切り替える': 'Switch to an AI Battle',
  'フレンドルーム作成': 'Create Friend Room', '6桁コード': '6-digit code', '参加': 'Join',
  'いつでもマッチ可能。集まりやすい時間は毎日 20:00〜22:00（逢魔が時）': 'Match anytime. The busiest hours are 20:00–22:00 JST daily.',
  '対戦募集は': 'Find opponents on the', 'でも行っています': 'as well.',
  'レアリティで絞り込み': 'Filter by rarity', '駒画像の拡大表示': 'Enlarged yokai image',
  'DMで報告する': 'Report via DM', 'プロフィールを開く': 'Open Profile', '対局の基本': 'Battle Basics',
  '勝ち方': 'How to Win', '動かし方': 'How to Move', '持ち駒と成り': 'Hand and Promotion',
  '覚えておくこと': 'Worth Remembering', '遊べるモード': 'Modes', '遊べるモードと報酬': 'Modes and Rewards',
  '全レア': 'All Rarities', '条件に合う駒がありません。': 'No yokai match these filters.',
  '異装': 'Alt', '大将': 'General', '成': 'Promoted', '覚': 'Awakened',
  'メンテ': 'Maintenance', 'イベント': 'Event', 'アップデート': 'Update', '現在お知らせはありません。': 'There are no announcements.',
  '対戦相手を探しています…': 'Searching for an opponent…', 'ルームへ参加しています…': 'Joining the room…',
  '対局中': 'In Battle', '投了しますか?': 'Do you want to resign?', '対象: 百鬼夜行の連戦': 'Applies to Night Parade win streaks',
  'オンライン接続時にランキングを閲覧できます': 'Connect online to view the rankings.', 'ランキングを読み込み中…': 'Loading rankings…',
  'まだ今週の記録がありません。最初の挑戦者になろう!': 'No records this week. Be the first challenger!',
  'あなたの今週の記録はまだありません': 'You do not have a record this week yet.', 'オンラインへ接続しています…': 'Connecting online…',
  'オンライン接続に失敗しました。通信状態を確認して、もう一度お試しください': 'Could not connect online. Check your connection and try again.',
  'オンライン接続が利用できません': 'Online connection is unavailable.', '再接続中…': 'Reconnecting…',
  '接続エラーが発生しました': 'A connection error occurred.', '接続が切れました': 'Disconnected.',
  'このコードを相手に伝えてください': 'Share this code with your opponent.',
  'まだ相手が見つかりません。待機を続けるか、すぐにAIと対戦できます。': 'No opponent yet. Keep waiting or battle the AI now.',
  '秒読み！': 'Final countdown!', '秒読み': 'Countdown', '相手の秒読み': "Opponent's countdown",
  '相手の秒読み！': "Opponent's countdown!", '切れたら負け': 'Timeout is a loss', '切れれば勝ち': 'Timeout is a win',
  'あなたの手番': 'Your turn', '相手の手番': "Opponent's turn", '敵の手番': 'Enemy turn', '対戦相手': 'Opponent',
  '満月 ― 会心確定!': 'Full Moon — Critical guaranteed!', 'SSR妖怪 見参': 'An SSR Yokai Appears',
  '覚醒 ― 真の力、解放': 'Awakening — True Power Unleashed',   'ダメージ半減! 駒は葉っぱに化けていた': 'Damage halved! The yokai was only a leaf.',
  '取った駒を道連れに爆散!': 'It explodes and takes its captor with it!', '鬼火を灯した': 'Lit an Onibi', '連勝ならず': 'No win streak',
  '自軍の持ち駒に戻った!': 'Returned to your hand!',
  'もう一つの顔が噛みついた!': 'The other face bit down!',
  '会心・月齢を封じた': 'Sealed criticals and moon skills',
  '勝利報酬を確認中…': 'Checking victory rewards…', '本日の勝利報酬は上限に達しました': "Today's victory reward limit has been reached.",
  '勝利報酬の付与に失敗しました(通信状態を確認)': 'Could not grant the victory reward. Check your connection.',
  '引き分け': 'Draw', '討伐成功': 'Victory', '敗北': 'Defeat', '我が大将が討ち取られた…': 'Your general was captured…',
  '魂力が尽き果てた…': 'Your HP was depleted…', '鬼火が敵大将を道連れにした!': 'Onibi took the enemy general with it!',
  '我が大将が鬼火の道連れに…': 'Onibi took your general with it…', '敵軍は身動きが取れなくなった!': 'The enemy has no legal moves!',
  '我が軍は身動きが取れなくなった…': 'Your army has no legal moves…', '投了した…': 'You resigned…',
  '相手の秒読みが切れた': "The opponent's countdown expired.", '秒読みが切れた…': 'Your countdown expired…',
  '相手の再接続猶予が切れた': "The opponent's reconnection time expired.", '再接続猶予が切れた…': 'Your reconnection time expired…',
  '飢餓の夜で双方の魂力が尽きた': 'Both sides ran out of HP during the Night of Hunger.', '300手に達したため引き分け': 'Draw after 300 moves.',
  '飢餓の夜で敵の魂力が尽きた!': 'The enemy ran out of HP during the Night of Hunger!', '飢餓の夜で魂力が尽きた…': 'You ran out of HP during the Night of Hunger…',
  '百鬼夜行ランキング1位限定': 'Night Parade #1 reward', '土曜対戦会限定': 'Saturday Battle exclusive',
  '初期選択またはガチャ': 'Starter choice or summon', 'ガチャ': 'Summon',
  '神妖 顕現': 'Divine Yokai Manifested', '大妖怪 降臨': 'Great Yokai Descends', '希少妖怪 出現': 'Rare Yokai Appears',
};
Object.entries(STATIC).forEach(([ja, en]) => add(ja, en));

type YokaiEnglish = readonly [name: string, move: string, skill: string, description: string, awaken?: string];
const YOKAI_EN: Record<string, YokaiEnglish> = {
  kyubi: ['Nine-Tailed Fox', '1 square in any direction', 'Foxfire Inferno', 'Capturing under a full moon always deals 2× damage (check the battle status for the moon phase)', 'Nine-Tails Unsealed'],
  shuten: ['Shuten-doji', '1 square in any direction', "Oni God's Mighty Arm", '20% chance for a capture to deal 2× damage', 'Oni God Rakshasa'],
  kooni: ['Little Oni', '1 square forward (promoted: Gold General movement)', 'Demon Fire', '30% chance for a capture to deal 1.5× damage'],
  nekomata: ['Nekomata', '1 square diagonally (promoted: diagonal + forward/back)', "Bakeneko's Curse", 'Captures in enemy territory deal +120 damage'],
  ittan: ['Ittan-momen', 'Any distance forward (promoted: +1 sideways/back)', 'Wind Cutter', 'A capture after moving at least 3 squares deals 2× damage'],
  nue: ['Nue', 'Leaps forward over pieces (promoted: +1 diagonally)', 'Roar of Chaos', '25% chance for a capture to deal 1.8× damage'],
  kappa: ['Kappa', '1 square orthogonally (promoted: 1 in any direction)', "Water God's Blessing", 'While on the board, your army takes 15% less damage'],
  nurikabe: ['Nurikabe', '1 forward or sideways (promoted: orthogonal + forward diagonals)', 'Iron Wall', 'While on the board, your army takes 20% less damage'],
  tengu: ['Tengu', 'Leaps 1–2 squares diagonally (promoted: +1 forward/back)', 'Hidden Gale', 'When captured, deals 300 counter damage to the captor'],
  rokuro: ['Rokurokubi', 'Any distance sideways +1 forward (promoted: +back/forward diagonals)', 'Grudge Strangle', 'When captured, deals 250 counter damage to the captor'],
  aooni: ['Blue Oni', '1 forward or forward-diagonal (promoted: Gold General movement)', 'Azure Smash', '25% chance for a capture to deal 1.6× damage'],
  kasha: ['Kasha', '1 square diagonally (promoted: diagonal + forward/back)', 'Hellfire Wheel', 'Captures in enemy territory deal +150 damage'],
  kamaitachi: ['Kamaitachi', 'Any distance forward (promoted: +1 sideways/back)', 'Vacuum Slash', 'A capture after moving at least 2 squares deals 1.8× damage'],
  hitouban: ['Hitoban', 'Any distance sideways +1 forward (promoted: +back/forward diagonals)', 'Flying Grudge', 'When captured, deals 300 counter damage to the captor'],
  suiko: ['Suiko', '1 square orthogonally (promoted: 1 in any direction)', 'Great Water Veil', 'While on the board, your army takes 22% less damage'],
  oonyudo: ['O-nyudo', '1 forward or sideways (promoted: orthogonal + forward diagonals)', 'Void Pressure', 'While on the board, your army takes 25% less damage'],
  daitengu: ['Great Tengu', 'Leaps 1–2 squares diagonally (promoted: +1 forward/back)', 'Tengu Gale', 'When captured, deals 400 counter damage to the captor'],
  raiju: ['Raiju', 'Leaps forward over pieces (promoted: +1 diagonally)', 'Lightning Fang', '30% chance for a capture to deal 1.8× damage'],
  ibaraki: ['Ibaraki-doji', 'Gold General movement (promoted: 1 in any direction)', "Arm's Return", 'When captured, returns to your hand instead of the enemy hand', 'Rashomon Severance'],
  tamamo: ['Tamamo-no-Mae', '1 square in any direction', 'Calamitous Invitation', 'After a capture, returns to its original square and the captured yokai joins you on that square', 'Ninefold Calamity'],
  sunakake: ['Sunakake-baba', '1 forward or forward-diagonal (promoted: Gold General movement)', 'Blinding Sand', 'While on the board, seals enemy critical skills'],
  tsuchigumo: ['Tsuchigumo', '1 diagonal + leap 2 forward (promoted: +1 orthogonally)', 'Corrosive Silk', 'While on the board, reduces enemy damage by 12%'],
  yukionna: ['Yuki-onna', '1 forward-diagonal or forward/back (promoted: 1 in any direction)', 'Freezing Breath', 'While on the board, disables the enemy combo multiplier'],
  zashiki: ['Zashiki-warashi', '1 square orthogonally (promoted: 1 in any direction)', 'Fortune Bringer', 'Capturing restores 250 HP to your army'],
  tanuki: ['Bake-danuki', '1 in the three forward directions and back (promoted: Gold General movement)', 'Leaf Decoy', 'When captured, halves damage and does not enter the enemy hand'],
  onibi: ['Onibi', '1 square diagonally (promoted: +1 forward/back)', 'Mutual Destruction', 'When captured, destroys the captor too (a general loses instantly!)'],
  nurarihyon: ['Nurarihyon', '1 square in any direction', 'Commander of the Night Parade', 'Deals +5% damage per ally on the board (up to +40%)', 'Supreme Night Parade'],
  karakasa: ['Karakasa-kozo', '1 forward or backward-diagonal (promoted: 1 in any direction)', 'Umbrella Guard', 'While on the board, your army takes 12% less damage'],
  chochin: ['Chochin-obake', '1 square orthogonally (promoted: 1 in any direction)', 'Lantern Light', 'Capturing restores 200 HP to your army'],
  baku: ['Baku', '1 forward/back, any distance sideways (promoted: orthogonal + forward diagonals)', 'Nightmare Eater', 'While on the board, reduces enemy damage by 15%'],
  yamata: ['Yamata-no-Orochi', '1 in three forward, two sideways, and back', 'Eight Heads', 'When captured, slithers to an adjacent empty square and loses a head. Escapes twice; the third capture fells it. Cannot capture the general', 'Eight-Headed Calamity'],
  bakezouri: ['Bake-zori', '1 forward or forward-diagonal (promoted: Gold General movement)', 'Sandal Decoy', 'When captured, halves damage and does not enter the enemy hand'],
  sunekosuri: ['Sunekosuri', '1 forward or sideways (promoted: orthogonal + forward diagonals)', "Shin-Rubber's Curse", 'While on the board, seals enemy critical skills'],
  kodama: ['Kodama', '1 square orthogonally (promoted: 1 in any direction)', "Forest's Breath", 'Capturing restores 150 HP to your army'],
  nopperabo: ['Nopperabo', '1 in the three forward directions and back (promoted: Gold General movement)', 'Faceless Illusion', 'When captured, halves damage and does not enter the enemy hand'],
  tenome: ['Tenome', 'Any distance sideways +1 forward (promoted: +back/forward diagonals)', "Tenome's Glare", 'When captured, deals 280 counter damage to the captor'],
  inugami: ['Inugami', '1 square diagonally (promoted: diagonal + forward/back)', "Possessed Hound's Curse", 'Captures in enemy territory deal +140 damage'],
  aoandon: ['Aoandon', '1 square orthogonally (promoted: 1 in any direction)', 'Blue Flame', 'Capturing restores 280 HP to your army'],
  umibozu: ['Umibozu', '1 square orthogonally (promoted: 1 in any direction)', 'Inky Sea Veil', 'While on the board, your army takes 23% less damage'],
  wanyudo: ['Wanyudo', 'Any distance forward (promoted: +1 sideways/back)', 'Karmic Fire Wheel', 'A capture after moving at least 2 squares deals 2× damage'],
  yatagarasu: ['Yatagarasu', 'Leaps forward over pieces (promoted: +1 diagonally)', 'Three-Legged Guidance', '28% chance for a capture to deal 1.9× damage'],
  oomyukade: ['Giant Centipede', '1 diagonal + leap 2 forward (promoted: +1 orthogonally)', "Centipede's Venom", 'While on the board, reduces enemy damage by 14%'],
  gashadokuro: ['Gashadokuro', '1 in three forward, two sideways, and back', "Starving Bones", 'During the Night of Hunger, captures deal 1.8× damage and restore 250 HP', 'Starving Skeleton King'],
  sukuna: ['Sukuna', 'Gold General movement (promoted: 1 in any direction)', 'Two Faces', 'After a capture, may strike one more adjacent enemy other than the general (the second hit deals half damage)', 'Two-Faced Sukuna'],
  makuragaeshi: ['Makuragaeshi', '1 in the three forward directions and back (promoted: Gold General movement)', 'Pillow Shadow-Return', 'After a capture, automatically returns to its original square'],
  rinka: ['Rinka', '1 square orthogonally (promoted: 1 in any direction)', 'Lingering Phosphor', 'Leaves a flame for 4 moves. An ally entering, capturing, or dropping there restores 150 HP'],
  tsurube: ['Tsurube-otoshi', 'Any distance forward (promoted: +1 sideways/back)', 'Pit to Darkness', 'Leaves a pit for 4 moves. An enemy entering it takes 80 HP damage'],
  shiranui: ['Shiranui', '1 square diagonally (promoted: diagonal + forward/back)', 'Sending Fire', 'After a capture, place an allied Onibi on an adjacent empty square'],
  enenra: ['Enenra', '1 square diagonally (promoted: +1 forward/back)', 'Smoke Shadow-Step', 'After a capture, may escape to an adjacent empty square or stay put'],
  ingyo: ['Inugami Gyobu', '1 diagonally and a forward knight leap (promoted: 1 in any direction + knight leap)', 'Art of Concealment', 'After a capture, choose to stay, return to the original square, or escape to an adjacent empty square', 'True Concealment'],
};

for (const [id, values] of Object.entries(YOKAI_EN)) {
  const def = YOKAI[id];
  if (!def) continue;
  add(def.name, values[0]);
  add(def.moveText, values[1]);
  add(def.skill.name, values[2]);
  add(def.skill.desc, values[3]);
  if (def.awakenName && values[4]) add(def.awakenName, values[4]);
}

const VARIANT_EN: Record<string, readonly [string, string, string]> = {
  kyubi_eclipse: ['Eclipse · Nine-Tailed Fox', 'Divine Yokai Manifested', 'Eclipse Unsealed'],
  shuten_kishin: ['Oni God · Shuten-doji', 'Oni God Awakened', 'Oni God Rakshasa · Zenith'],
  ibaraki_rashomon: ['Rashomon · Ibaraki-doji', 'Rashomon Manifested', 'Rashomon · True Blade'],
  tamamo_keikoku: ['Calamity · Tamamo-no-Mae', 'Calamity Descends', 'Calamitous Age · Zenith'],
  nurarihyon_hyakki: ['Night Parade · Nurarihyon', 'Night Parade Begins', 'Night Parade · Grand Finale'],
  kyubi_hasha: ['Champion · Nine-Tails', 'Night Parade Champion Descends', 'Champion · Eclipse Unsealed'],
};
for (const [id, values] of Object.entries(VARIANT_EN)) {
  const def = YOKAI[id];
  if (!def) continue;
  add(def.name, values[0]);
  if (def.summonTitle) add(def.summonTitle, values[1]);
  if (def.awakenName) add(def.awakenName, values[2]);
}

[['新月', 'New Moon'], ['三日月', 'Crescent Moon'], ['半月', 'Half Moon'], ['満月', 'Full Moon']].forEach(([ja, en]) => add(ja, en));
const resonanceEn = [
  ['Oni Feast', 'While Shuten-doji and Ibaraki-doji are both on the board, Shuten-doji gains +15% critical chance'],
  ['Foxfire Bond', 'When Nine-Tailed Fox and Tamamo-no-Mae are together and one is captured, the other becomes enraged and its next attack is a guaranteed critical'],
] as const;
RESONANCES.forEach((r, i) => { add(r.name, resonanceEn[i][0]); add(r.desc, resonanceEn[i][1]); });

const HTML_OVERRIDES: Record<string, string> = {
  '.title-logo': '<span>Hyakkiban</span>',
  '.rules-scroll': `
    <p class="rules-lead">Collect yokai, capture them, and drain HP. Skills differ by yokai — <b>press and hold</b> a piece, or open the <b>Compendium</b>.</p>
    <h3>How to Win</h3>
    <ul>
      <li>Reduce the opponent's <b>HP to 0</b></li>
      <li>Capture their <b>General</b></li>
      <li>Leave them with no legal move</li>
    </ul>
    <h3>How to Move</h3>
    <ul>
      <li>A short tap selects and moves. <b>Press and hold</b> for details</li>
      <li>Capturing deals damage equal to your yokai's <b>attack</b></li>
      <li>Consecutive captures raise a <b>combo</b>, up to 2× damage (a non-capture, summon, or awakening resets it)</li>
    </ul>
    <h3>Hand and Promotion</h3>
    <ul>
      <li>Captured yokai join your hand and can be summoned onto empty squares (some cannot drop in the farthest ranks)</li>
      <li>A non-General entering the last two enemy ranks <b>promotes</b> automatically: 1.5× attack and stronger movement</li>
    </ul>
    <h3>Worth Remembering</h3>
    <ul>
      <li><b>Night of Hunger:</b> After eight moves without a capture, both sides lose 50 HP each move. A capture resets it. Check remaining moves in <b>Status</b></li>
      <li><b>SSR Awakening:</b> Captures fill a gauge. Once full, spend a turn to empower one friendly SSR, once per battle (1.5× ATK for three of your turns)</li>
    </ul>
    <h3>Modes</h3>
    <ul>
      <li><b>Night Parade:</b> Solo win streaks. Weekly rankings; last week's #1 gets the exclusive “Champion · Nine-Tails” alt (first time only)</li>
      <li><b>Online:</b> Random match anytime; busiest 20:00–22:00 JST. 60 seconds per move plus a 30-second countdown. Friend rooms use a 6-digit code</li>
      <li><b>Summon &amp; Formation:</b> Spend tickets (a 10-pull guarantees SR+). Duplicates become Spirit Power; 300 = 1 ticket. Formation needs exactly one General</li>
    </ul>`,
  '.solo-note': 'Face a changing enemy army in every Night Parade challenge.<br>A loss resets your streak.<br>Build the longest streak and climb the weekly rankings.',
  '.pieces-note': 'Review each yokai’s movement, abilities, SSR traits, awakening, and resonances. Promotion grants 1.5× attack and stronger movement.',
  '#modal-consent .link-desc': 'Online features store an account ID, play data, and access logs. The Steam version sends a Session Ticket to Valve to authenticate with your Steam ID. On the browser version, optional rewarded ads may send device and connection information to an ad network. The Steam version has no ads. Review the policies below before accepting.',
  '#modal-link .link-desc:nth-of-type(1)': 'Clearing browser data can erase your progress. Register a <b>passkey</b> or create a <b>transfer code</b> so you can restore it.',
  '#modal-link .link-desc:nth-of-type(2)': 'Use this code to move your data to another device or browser. <b>Store it somewhere safe.</b>',
  '#modal-link .link-desc:nth-of-type(3)': 'Use a received code to transfer data to this device. <b>Current data on this device will be replaced.</b>',
  '#modal-link-nudge .link-desc': 'Clearing browser data can erase your progress. Register a <b>passkey</b> or create a <b>transfer code</b> to keep it safe.',
  '#modal-session-recovery .link-desc:nth-of-type(1)': 'Local data may have been cleared, or this account may not have been used for a long time. Restore it with a <b>passkey</b> or <b>transfer code</b>.',
  '#modal-session-recovery .link-desc:nth-of-type(2)': 'If you have no recovery method, you can start with new progress.',
  '#modal-support .link-desc': 'For bugs, feedback, or data questions, send a <b>DM</b> to <b id="support-handle">@nit_zunda_dev</b>. Use the <a href="https://discord.gg/qhm6YSSUz" target="_blank" rel="noopener noreferrer">official Discord</a> to find opponents or share feedback.',
  '#modal-support .support-notes': '<li>The button below opens X with a report template (X login required).</li><li>Describe <b>what happened</b> and <b>which screen</b> you were using.</li><li>Never send <b>transfer codes, credentials, or personal information</b>.</li><li>Replies may take some time.</li>',
};

const htmlOriginals = new Map<Element, string>();

function translatePatterns(value: string): string {
  const exact = EN.get(value);
  if (exact) return exact;

  let out = value;
  const replacements: Array<[RegExp, string]> = [
    [/^(.+)の詳細を見る$/, 'View $1 details'], [/^(.+)の画像を拡大$/, 'Enlarge image of $1'],
    [/第\s*(\d+)\s*戦/g, 'Battle $1'], [/^(\d+)戦目$/, 'Battle $1'], [/^(\d+)連勝$/, '$1 wins'],
    [/^(\d+)位$/, '#$1'], [/今週(\d+)位/g, 'Weekly rank: #$1'], [/（(\d+)位）/g, ' (#$1)'],
    [/あなたの今週ベスト:\s*(\d+)連勝\((\d+)位\)/g, 'Your weekly best: $1 wins (#$2)'],
    [/対戦相手を探しています\(待機\s*(\d+)番目\)/g, 'Searching for an opponent (queue position: $1)'],
    [/飢餓まであと(\d+)/g, '$1 moves until Hunger'], [/飢餓の夜\s*-(\d+)/g, 'Night of Hunger −$1'],
    [/満月まで(\d+)夜/g, '$1 nights until Full Moon'], [/残火 \+(\d+)/g, 'Ember +$1'],
    [/燐火 \+(\d+)/g, 'Spirit Flame +$1'], [/落とし穴 (\d+)/g, 'Pit $1'],
    [/勝利報酬:\s*ガチャチケット\s*🎟\s*\+(\d+)/g, 'Victory reward: Ticket 🎟 +$1'],
    [/参加報酬:\s*ガチャチケット\s*🎟\s*\+(\d+)/g, 'Participation reward: Ticket 🎟 +$1'],
    [/通算発動\s*(\d+)回/g, 'Lifetime activations: $1'], [/(\d+)\s*\/\s*(\d+)\s*体/g, '$1 / $2 yokai'],
    [/異装:\s*通常版と同じ性能。専用演出と覚醒技名を持つ/g, 'Alt: Same stats as the standard version, with unique effects and awakening name'],
    [/月齢:\s*満月に駒を取ると確定会心\s*×([\d.]+)/g, 'Moon: Captures under a full moon guarantee a critical ×$1'],
    [/成長:\s*駒を取るごとに与ダメ\+(\d+)%\(最大\+(\d+)%\)/g, 'Growth: Each capture adds $1% damage (up to +$2%)'],
    [/布陣:\s*盤上の味方1体ごとに与ダメ\+(\d+)%\(最大\+(\d+)%\)/g, 'Army: Each ally on board adds $1% damage (up to +$2%)'],
    [/会心:\s*駒を取った時(\d+)%でダメージ×([\d.]+)/g, 'Critical: $1% chance for ×$2 damage on capture'],
    [/傾国:\s*取った駒をその場で味方にし、自身は元マスへ戻る/g, 'Calamity: After a capture, the yokai joins you and Tamamo returns'],
    [/回帰:\s*取られても自分の持ち駒に戻る/g, 'Return: When captured, returns to your hand'],
    [/八岐:\s*取られても隣接へ逃げる\((\d+)回まで\)。大将は取れない/g, 'Hydra: When captured, escapes adjacent (up to $1 times). Cannot capture the general'],
    [/飢餓:\s*飢餓の夜の取りが×([\d.]+)かつ魂力(\d+)回復/g, 'Famine: During Hunger, captures deal ×$1 and restore $2 HP'],
    [/双面:\s*取ったあと隣接の別敵\(大将以外\)を追撃\(2体目はダメージ半分\)/g, 'Two Faces: After a capture, may strike one more adjacent enemy other than the general at half damage'],
    [/(.+)を味方にした!/g, '$1 joined your army!'],
    [/首が逃げた! 残り(\d+)首/g, 'A head slithered away! $1 heads left'],
    [/覚醒:\s*(.+) \/ 自分の手番3回のあいだATK×([\d.]+)/g, 'Awakening: $1 / ATK ×$2 for three of your turns'],
    [/因縁:\s*(.+)/g, 'Resonance: $1'], [/【SSR特性】/g, '[SSR Traits]'], [/【覚醒技】/g, '[Awakening]'],
    [/【因縁効果】/g, '[Resonance]'], [/【成】/g, ' [Promoted]'], [/反撃ダメージ\s*(\d+)!/g, 'Counter damage: $1!'],
    [/魂力解放\s*ATK×([\d.]+)/g, 'Spirit Unleashed · ATK ×$1'], [/ダメージ\s*\+(\d+)/g, 'Damage +$1'],
    [/今週ベスト\s*(\d+)/g, 'Weekly best: $1'], [/連勝はここで途切れた（(\d+)連勝）/g, 'Streak ended at $1 wins'],
    [/手数/g, 'Moves'], [/撃破数/g, 'Captures'], [/与ダメージ/g, 'Damage Dealt'], [/被ダメージ/g, 'Damage Taken'],
    [/最大コンボ/g, 'Max Combo'], [/残り魂力/g, 'HP Remaining'],
  ];
  for (const [pattern, replacement] of replacements) out = out.replace(pattern, replacement);

  // Translate known names and terms embedded inside dynamic sentences.
  const embedded = [...EN.entries()].filter(([ja]) => ja.length >= 2).sort((a, b) => b[0].length - a[0].length);
  for (const [ja, en] of embedded) out = out.replaceAll(ja, en);
  for (const [id, values] of Object.entries(YOKAI_EN)) {
    const name = YOKAI[id]?.name;
    if (name) out = out.replaceAll(name, values[0]);
  }
  return out;
}

export function t(value: string): string {
  return locale === SOURCE_LOCALE ? value : translatePatterns(value);
}

function translateTextNode(node: Text): void {
  const value = node.data;
  if (!/[ぁ-んァ-ヶ一-龠々]/.test(value)) return;
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.trim();
  if (!core) return;
  originals.set(node, value);
  const translated = translatePatterns(core);
  if (translated !== core) node.data = leading + translated + trailing;
}

function translateAttributes(el: Element): void {
  for (const name of ['title', 'aria-label', 'placeholder', 'alt']) {
    const value = el.getAttribute(name);
    if (!value || !/[ぁ-んァ-ヶ一-龠々]/.test(value)) continue;
    let attrs = attributeOriginals.get(el);
    if (!attrs) { attrs = new Map(); attributeOriginals.set(el, attrs); }
    attrs.set(name, value);
    const translated = translatePatterns(value);
    if (translated !== value) el.setAttribute(name, translated);
  }
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root as Text); return; }
  if (!(root instanceof Element)) return;
  translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text);
    else translateAttributes(node as Element);
  }
}

function applyHtmlOverrides(): void {
  for (const [selector, html] of Object.entries(HTML_OVERRIDES)) {
    document.querySelectorAll<HTMLElement>(selector).forEach(el => {
      if (!htmlOriginals.has(el)) htmlOriginals.set(el, el.innerHTML);
      el.innerHTML = html;
    });
  }
}

function updateHead(): void {
  const def = localeDef();
  const root = document.documentElement;
  root.lang = def.htmlLang;
  root.dataset.script = def.script;
  root.dataset.locale = def.id;

  if (def.id === 'en') {
    document.title = STATIC['百鬼盤｜妖怪を集めて、取って、HPを削る対戦ゲーム'];
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', 'Collect yokai, capture, and drain HP in this free browser battle game. Play solo, build your army, summon yokai, or battle online.');
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute('content', 'Collect yokai, capture, and drain HP in this free browser battle game.');
    document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.setAttribute('content', 'Collect yokai, capture, and drain HP in this free browser battle game.');
  } else {
    document.title = '百鬼盤｜妖怪を集めて、取って、HPを削る対戦ゲーム';
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', '妖怪を集めて、取って、HPを削る対戦ゲーム。ソロ対戦、編成、ガチャ、オンライン対戦に対応。登録なしですぐに遊べます。');
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute('content', '妖怪を集めて、取って、HPを削る対戦ゲーム。ソロ対戦、編成、ガチャ、オンライン対戦に対応。');
    document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.setAttribute('content', '妖怪を集めて、取って、HPを削る対戦ゲーム。登録なしですぐに遊べます。');
  }
  document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.setAttribute('content', def.ogLocale);
  document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute('content', document.title);
  document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.setAttribute('content', document.title);

  document.querySelectorAll<HTMLAnchorElement>('a[href*="/legal/terms"], a[href*="/legal/privacy"]').forEach(link => {
    if (link.href.includes('/legal/terms')) link.href = def.termsPath;
    if (link.href.includes('/legal/privacy')) link.href = def.privacyPath;
  });
}

function restoreSourceLocale(): void {
  observer?.disconnect();
  for (const [el, html] of htmlOriginals) el.innerHTML = html;
  htmlOriginals.clear();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = document.body;
  do {
    const original = originals.get(node);
    if (original !== undefined && node.nodeType === Node.TEXT_NODE) (node as Text).data = original;
    if (node instanceof Element) {
      const element = node;
      const attrs = attributeOriginals.get(element);
      attrs?.forEach((value, name) => element.setAttribute(name, value));
    }
  } while ((node = walker.nextNode()));
  observe();
}

function populateLocaleSelect(): void {
  const select = document.querySelector<HTMLSelectElement>('#locale-select');
  if (!select) return;
  select.replaceChildren();
  for (const id of SUPPORTED_LOCALES) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = LOCALES[id].nativeLabel;
    select.appendChild(opt);
  }
  select.value = locale;
  select.setAttribute('aria-label', 'Language');
  select.title = 'Language';
}

function syncLocaleSelect(): void {
  const select = document.querySelector<HTMLSelectElement>('#locale-select');
  if (select) select.value = locale;
}

function observe(): void {
  observer ??= new MutationObserver(mutations => {
    if (locale === SOURCE_LOCALE || applying) return;
    applying = true;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateTextNode(mutation.target as Text);
      else if (mutation.type === 'attributes') translateAttributes(mutation.target as Element);
      else mutation.addedNodes.forEach(walk);
    }
    applying = false;
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder', 'alt'] });
}

function applyLocaleOverlay(): void {
  /* Today only English has an overlay dictionary. Future locales get their own tables here. */
  if (locale === 'en') {
    applyHtmlOverrides();
    walk(document.body);
  }
}

export function setLocale(next: AppLocale): void {
  if (!isAppLocale(next) || next === locale) return;
  applying = true;
  if (locale !== SOURCE_LOCALE) restoreSourceLocale();
  locale = next;
  if (next !== SOURCE_LOCALE) applyLocaleOverlay();
  updateHead();
  syncLocaleSelect();
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage may be unavailable */ }
  applying = false;
  window.dispatchEvent(new CustomEvent('yokai-locale-change', { detail: next }));
}

export function getLocale(): AppLocale { return locale; }

export function initializeLocale(): void {
  let saved: string | null = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
  const query = new URLSearchParams(location.search).get('lang');
  locale = SOURCE_LOCALE;
  const preferred: AppLocale = isAppLocale(query) ? query : isAppLocale(saved) ? saved : SOURCE_LOCALE;

  populateLocaleSelect();
  document.querySelector<HTMLSelectElement>('#locale-select')?.addEventListener('change', ev => {
    const value = (ev.currentTarget as HTMLSelectElement).value;
    if (isAppLocale(value)) setLocale(value);
  });
  observe();
  if (preferred !== SOURCE_LOCALE) setLocale(preferred);
  else { updateHead(); syncLocaleSelect(); }

  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  window.alert = message => nativeAlert(typeof message === 'string' ? t(message) : message);
  window.confirm = message => nativeConfirm(typeof message === 'string' ? t(message) : message);
}
