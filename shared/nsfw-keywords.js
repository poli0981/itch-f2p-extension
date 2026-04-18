// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * NSFW keyword database — multilingual.
 *
 * Organized by language/category for maintainability.
 * All keywords are lowercase. Matching is done via substring search
 * against tags and description text.
 *
 * Categories:
 *   - English: primary keywords
 *   - Japanese: common JP NSFW tags on itch.io
 *   - Chinese: simplified + traditional
 *   - Korean: common KR tags
 *   - Spanish / Portuguese / French / German / Russian / Vietnamese:
 *     common NSFW terms that appear in itch.io game tags/descriptions
 *   - Symbols / shorthand: 18+, r-18, r18, etc.
 */

// ── English ──
const EN = [
    "adult", "nsfw", "erotic", "erotica", "hentai", "porn", "pornographic",
    "mature", "sexual", "sexual content", "nudity", "nude", "naked",
    "lewd", "ecchi", "bdsm", "fetish", "bondage", "s&m",
    "furry", "yuri", "yaoi", "bara", "otome",
    "sex", "intercourse", "orgasm", "masturbation",
    "explicit", "xxx", "x-rated",
    "stripshow", "striptease", "strip poker",
    "ahegao", "tentacle", "tentacles",
    "succubus", "incubus",
    "dating sim", "dating simulator",  // not always NSFW, but flagged for review
];

// ── Japanese ──
const JA = [
    "\u30A8\u30ED", "\u30A8\u30C3\u30C1",           // エロ, エッチ
    "\u30D8\u30F3\u30BF\u30A4",                       // ヘンタイ
    "\u304A\u3063\u3071\u3044",                       // おっぱい
    "\u88F8",                                         // 裸 (nude)
    "\u6210\u4EBA",                                   // 成人 (adult)
    "\u6027\u7684",                                   // 性的 (sexual)
    "\u5B98\u80FD",                                   // 官能 (sensual)
    "\u767E\u5408",                                   // 百合 (yuri)
    "\u3084\u304A\u3044",                             // やおい
    "r-18", "r18",
];

// ── Chinese (Simplified + Traditional) ──
const ZH = [
    "\u6210\u4EBA",                                   // 成人
    "\u8272\u60C5",                                   // 色情
    "\u88F8\u4F53", "\u88F8\u9AD4",                   // 裸体, 裸體
    "\u60C5\u8272",                                   // 情色
    "\u6027\u611F",                                   // 性感
    "\u53D8\u6001", "\u8B8A\u614B",                   // 变态, 變態
    "\u7F8E\u5C11\u5973",                             // 美少女
    "\u5DE8\u4E73",                                   // 巨乳
    "\u798F\u5229",                                   // 福利
    "\u7981\u6B62\u672A\u6210\u5E74",                 // 禁止未成年
];

// ── Korean ──
const KO = [
    "\uC131\uC778",                                   // 성인 (adult)
    "\uC57C\uD55C",                                   // 야한 (naughty/lewd)
    "\uC5D0\uB85C",                                   // 에로 (ero)
    "\uB204\uB4DC",                                   // 누드 (nude)
    "\uC139\uC2DC",                                   // 섹시 (sexy)
    "\uC131\uC801",                                   // 성적 (sexual)
    "\uD5E8\uD0C0\uC774",                             // 헨타이 (hentai)
    "19\uAE08",                                       // 19금 (19+)
];

// ── Spanish ──
const ES = [
    "adulto", "adulta", "er\u00F3tico", "er\u00F3tica",
    "desnudo", "desnuda", "desnudez",
    "sexual", "sexo", "pornograf\u00EDa",
    "contenido adulto", "solo adultos",
];

// ── Portuguese ──
const PT = [
    "adulto", "adulta", "er\u00F3tico", "er\u00F3tica",
    "nudez", "nu", "nua",
    "sexual", "sexo", "pornografia",
    "conte\u00FAdo adulto",
];

// ── French ──
const FR = [
    "adulte", "\u00E9rotique",
    "nu", "nue", "nudit\u00E9",
    "sexuel", "sexuelle", "sexe",
    "pornographie", "pornographique",
    "contenu adulte",
];

// ── German ──
const DE = [
    "erwachsene", "erotik", "erotisch",
    "nackt", "nacktheit",
    "sexuell", "sex",
    "pornografie", "pornographisch",
    "ab 18",
];

// ── Russian ──
const RU = [
    "\u0432\u0437\u0440\u043E\u0441\u043B\u044B\u0439",   // взрослый (adult)
    "\u044D\u0440\u043E\u0442\u0438\u043A\u0430",           // эротика
    "\u043F\u043E\u0440\u043D\u043E",                       // порно
    "\u043E\u0431\u043D\u0430\u0436\u0451\u043D\u043D\u044B\u0439", // обнажённый (nude)
    "\u0441\u0435\u043A\u0441",                             // секс
    "\u0445\u0435\u043D\u0442\u0430\u0439",                 // хентай
    "18+",
];

// ── Vietnamese ──
const VI = [
    "ng\u01B0\u1EDDi l\u1EDBn",                       // người lớn (adult)
    "khi\u00EAu d\u00E2m",                             // khiêu dâm (pornographic)
    "kh\u1ECFa th\u00E2n",                             // khỏa thân (nude)
    "g\u1EE3i c\u1EA3m",                               // gợi cảm (sexy)
    "t\u00ECnh d\u1EE5c",                               // tình dục (sexual)
    "sex", "18+",
];

// ── Symbols / Shorthand ──
const SYMBOLS = [
    "18+", "18 +", "r-18", "r18", "21+",
    "nsfw", "n.s.f.w",
    "xxx", "x-rated", "x rated",
];

/**
 * Flattened, deduplicated, lowercase keyword set.
 * Single source of truth — content/detector.js imports via build step
 * (scripts/build-detector.js) since MV3 content scripts cannot use ES modules.
 */
const ALL_KEYWORDS = [
    ...EN, ...JA, ...ZH, ...KO,
    ...ES, ...PT, ...FR, ...DE, ...RU, ...VI,
    ...SYMBOLS,
];

// Deduplicate and lowercase
export const NSFW_KEYWORDS = [...new Set(ALL_KEYWORDS.map((k) => k.toLowerCase()))];
