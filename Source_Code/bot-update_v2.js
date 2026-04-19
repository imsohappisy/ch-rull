/* ========================================================
   채린룰 능력 끝말잇기 봇 (메신저봇 레거시 API 버전)
   ======================================================== */

// --- [설정 영역] ---
let PREFIX = "1";       // 일반 명령어 접두사 (채린룰 기본)
let INPUT_PFX = "0";    // 단어 입력 접두사
let ADMIN_PFX = ".dev";  // 관리자 명령어 접두사
let games = {};
let WORD_SET = null;
let KILL_SET = null;
let WORD_LIST = [];
let SEARCH_WORD_LIST = [];
let WORDS_BY_START = {};
let nextw = "";
let isOn = true;

if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (search, pos) {
        pos = pos || 0;
        return this.substring(pos, pos + search.length) === search;
    };
}
if (!String.prototype.includes) {
    String.prototype.includes = function (search, start) {
        return this.indexOf(search, start || 0) !== -1;
    };
}
if (!String.prototype.repeat) {
    String.prototype.repeat = function (count) {
        count = count || 0;
        let out = "";
        for (let i = 0; i < count; i++) out += this;
        return out;
    };
}
if (!Array.prototype.includes) {
    Array.prototype.includes = function (search, start) {
        return this.indexOf(search, start || 0) !== -1;
    };
}
if (!Array.prototype.find) {
    Array.prototype.find = function (callback, thisArg) {
        for (let i = 0; i < this.length; i++) {
            if (callback.call(thisArg, this[i], i, this)) return this[i];
        }
        return undefined;
    };
}
if (!Array.from) {
    Array.from = function (iterable) {
        let arr = [];
        for (let i = 0; i < iterable.length; i++) arr.push(iterable[i]);
        return arr;
    };
}
if (!Object.entries) {
    Object.entries = function (obj) {
        let keys = Object.keys(obj);
        let entries = [];
        for (let i = 0; i < keys.length; i++) entries.push([keys[i], obj[keys[i]]]);
        return entries;
    };
}
if (!Object.values) {
    Object.values = function (obj) {
        let keys = Object.keys(obj);
        let values = [];
        for (let i = 0; i < keys.length; i++) values.push(obj[keys[i]]);
        return values;
    };
}

const FULL_VIEW = "\u200b".repeat(500);

let ROUTESYL_SET = null;
let INTENDSYL_SET = null;
let KILLSYL_SET = null;
let ROUTESYL_STR = "";
let INTENDSYL_STR = "";
let KILLSYL_STR = "";

const JSON_BASE_PATH = "storage/emulated/0/Download/Kakaotalk";
const FILE_PATH = JSON_BASE_PATH + "/wordlist.json";
const KILL_FILE_PATH = JSON_BASE_PATH + "/killword.json";
const DIESYL_FILE_PATH = JSON_BASE_PATH + "/diesyl.json";

function sanitizeOutput(text) {
    let out = String(text == null ? "" : text);
    out = out.replace(/[◆▶§※￦]/g, "");
    out = out.replace(/[{}<>]/g, "");
    out = out.replace(/[‘’]/g, "'");
    out = out.replace(/[“”]/g, "\"");
    out = out.replace(/→/g, "에서");
    out = out.replace(/·/g, ".");
    out = out.replace(/↳/g, "");
    out = out.replace(/×/g, "x");
    out = out.replace(/≤/g, "<=");
    out = out.replace(/[🏆💀🎲🧮🆘🚂⚠]/g, "");
    out = out.replace(/\|/g, "/");
    out = out.replace(/[ \t]+\n/g, "\n");
    out = out.replace(/\n{3,}/g, "\n\n");
    out = out.replace(/[ ]{2,}/g, " ");
    return out.replace(/^\s+|\s+$/g, "");
}

function systemLine(text) {
    return "[시스템]: " + text;
}

function jobLine(job, text) {
    return "[" + job + "]: " + text;
}

function createSafeReplier(baseReplier) {
    return {
        reply: function (text) {
            let out = sanitizeOutput(text);
            if (!out) return;
            if (!/^\[[^\]]+\]:/.test(out)) out = systemLine(out);
            return baseReplier.reply(out);
        }
    };
}

function replySystem(replier, text) {
    replier.reply(systemLine(text));
}

function replyJob(replier, job, text) {
    replier.reply(jobLine(job, text));
}

function pushSystem(msgs, text) {
    msgs.push(systemLine(text));
}

function pushJob(msgs, job, text) {
    msgs.push(jobLine(job, text));
}

function joinLines(lines) {
    let filtered = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i]) filtered.push(lines[i]);
    }
    return filtered.join("\n");
}

function joinFoldedLines(visibleLines, hiddenLines) {
    let visible = joinLines(visibleLines || []);
    let hidden = joinLines(hiddenLines || []);
    if (!hidden) return visible;
    if (!visible) return hidden;
    return visible + FULL_VIEW + "\n" + hidden;
}

function foldByVisibleLines(text, visibleLineCount) {
    let source = String(text == null ? "" : text);
    if (!FULL_VIEW || !visibleLineCount) return source;

    let lines = source.split("\n");
    let visible = [];
    let hidden = [];
    let shown = 0;
    let intoHidden = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (!intoHidden) {
            visible.push(line);
            if (line.replace(/^\s+|\s+$/g, "") !== "") shown++;
            if (shown >= visibleLineCount) intoHidden = true;
        } else {
            hidden.push(line);
        }
    }

    let hiddenText = hidden.join("\n");
    if (!hiddenText.replace(/\s/g, "")) return source;

    while (visible.length > 0 && visible[visible.length - 1] === "") {
        hidden.unshift(visible.pop());
    }

    return visible.join("\n") + FULL_VIEW + "\n" + hidden.join("\n");
}

function safeGc() {
    try {
        if (typeof Api !== "undefined" && Api.gc) Api.gc();
        else java.lang.System.gc();
    } catch (e) { }
}

/** 단어 데이터 로드 (diesyl 포함) */
function loadHeavyWords() {
    try {
        let words = FileStream.readJson(FILE_PATH);
        if (!words) return "파일 없음: " + FILE_PATH;

        WORD_LIST = Array.isArray(words) ? words.slice() : [];
        WORD_SET = new Set(WORD_LIST);
        WORD_LIST = Array.from(WORD_SET);
        SEARCH_WORD_LIST = WORD_LIST.slice();
        WORDS_BY_START = {};
        for (let i = 0; i < WORD_LIST.length; i++) {
            let word = WORD_LIST[i];
            let first = word[0];
            if (!WORDS_BY_START[first]) WORDS_BY_START[first] = [];
            WORDS_BY_START[first].push(word);
        }
        KILL_SET = new Set(FileStream.readJson(KILL_FILE_PATH) || []);

        let diesyl = FileStream.readJson(DIESYL_FILE_PATH) || {};
        ROUTESYL_SET = new Set(diesyl.Routesyl || []);
        INTENDSYL_SET = new Set(diesyl.Intendsyl || []);
        KILLSYL_SET = new Set(diesyl.Killsyl || []);
        ROUTESYL_STR = Array.from(ROUTESYL_SET).join("");
        INTENDSYL_STR = Array.from(INTENDSYL_SET).join("");
        KILLSYL_STR = Array.from(KILLSYL_SET).join("");

        safeGc();
        return "로드 성공: 일반 " + WORD_SET.size + "개 / 음절규칙 " + (ROUTESYL_SET.size + INTENDSYL_SET.size + KILLSYL_SET.size) + "개";
    } catch (e) {
        return "로드 실패: " + e.message;
    }
}


/** 두음법칙 적용 */
// --- 도우미 판정기 모음 ---
function isHanbang(word) {
    if (!KILLSYL_SET) return false;
    if (word.length === 0) return false;
    return KILLSYL_SET.has(word[word.length - 1]);
}

function isYudo(word) {
    if (!INTENDSYL_SET) return false;
    if (word.length === 0) return false;
    return INTENDSYL_SET.has(word[word.length - 1]);
}

function isRoot(word) {
    if (!ROUTESYL_SET) return false;
    if (word.length === 0) return false;
    return ROUTESYL_SET.has(word[0]) && ROUTESYL_SET.has(word[word.length - 1]);
}

function hasBatchim(char) {
    const decomposed = decomposeSyllable(char);
    return decomposed ? decomposed.gi > 0 : false;
}

function isAllBatchimWord(word) {
    if (!word || word.length === 0) return false;
    for (let i = 0; i < word.length; i++) {
        if (!hasBatchim(word[i])) return false;
    }
    return true;
}

function getNonFirstSyllables(word) {
    let result = [];
    let seen = {};
    for (let i = 1; i < word.length; i++) {
        let ch = word[i];
        if (!seen[ch]) {
            seen[ch] = true;
            result.push(ch);
        }
    }
    return result;
}

const COMPLEX_JONGSEONG_PARTS = {
    "ㄳ": ["ㄱ", "ㅅ"],
    "ㄵ": ["ㄴ", "ㅈ"],
    "ㄶ": ["ㄴ", "ㅎ"],
    "ㄺ": ["ㄹ", "ㄱ"],
    "ㄻ": ["ㄹ", "ㅁ"],
    "ㄼ": ["ㄹ", "ㅂ"],
    "ㄽ": ["ㄹ", "ㅅ"],
    "ㄾ": ["ㄹ", "ㅌ"],
    "ㄿ": ["ㄹ", "ㅍ"],
    "ㅀ": ["ㄹ", "ㅎ"],
    "ㅄ": ["ㅂ", "ㅅ"]
};

function collectConsonantSet(word) {
    let set = {};
    for (let i = 0; i < word.length; i++) {
        let decomposed = decomposeSyllable(word[i]);
        if (!decomposed) continue;
        set[decomposed.chosung] = true;
        if (decomposed.jongsung) {
            let parts = COMPLEX_JONGSEONG_PARTS[decomposed.jongsung] || [decomposed.jongsung];
            for (let j = 0; j < parts.length; j++) {
                set[parts[j]] = true;
            }
        }
    }
    return set;
}

function getGalileoNewMoons(state, word) {
    let set = collectConsonantSet(word);
    let keys = Object.keys(set);
    let moons = [];

    if (!state.galileo_moons) {
        state.galileo_moons = { io: false, europa: false, ganymede: false, callisto: false };
    }

    if (!state.galileo_moons.io && keys.length === 1 && set["ㅇ"]) {
        state.galileo_moons.io = true;
        moons.push("이오");
    }
    if (!state.galileo_moons.europa && set["ㅇ"] && set["ㄹ"] && set["ㅍ"]) {
        state.galileo_moons.europa = true;
        moons.push("유로파");
    }
    if (!state.galileo_moons.ganymede && set["ㄱ"] && set["ㄴ"] && set["ㅁ"] && set["ㄷ"]) {
        state.galileo_moons.ganymede = true;
        moons.push("가니메데");
    }
    if (!state.galileo_moons.callisto && set["ㅋ"] && set["ㄹ"] && set["ㅅ"] && set["ㅌ"]) {
        state.galileo_moons.callisto = true;
        moons.push("칼리스토");
    }

    return moons;
}

function getGalileoMoonList(state) {
    if (!state || !state.galileo_moons) return [];
    let moons = [];
    if (state.galileo_moons.io) moons.push("이오");
    if (state.galileo_moons.europa) moons.push("유로파");
    if (state.galileo_moons.ganymede) moons.push("가니메데");
    if (state.galileo_moons.callisto) moons.push("칼리스토");
    return moons;
}

function hasGalileoCompleteSet(state) {
    return !!(state && state.galileo_moons && state.galileo_moons.io && state.galileo_moons.europa && state.galileo_moons.ganymede && state.galileo_moons.callisto);
}

function composerNoteToUnits(noteType) {
    if (noteType === "2") return 4;
    if (noteType === "4") return 2;
    if (noteType === "8") return 1;
    return 0;
}

function composerUnitsToBeatText(units) {
    let beats = units / 2;
    if (Math.floor(beats) === beats) return String(beats);
    return String(beats);
}

/** 음절 단위 분리기 */
function decomposeSyllable(char) {
    const hangulBase = 0xac00;
    const choseongList = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
    const jungseongList = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
    const jongseongList = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

    const code = char.charCodeAt(0) - hangulBase;
    if (code < 0 || code > 11171) return null; // 한글 아님

    const ci = Math.floor(code / 588);
    const ji = Math.floor((code % 588) / 28);
    const gi = code % 28;
    return { chosung: choseongList[ci], jungsung: jungseongList[ji], jongsung: jongseongList[gi], ci: ci, ji: ji, gi: gi };
}

/** 초/중/종성 인덱스로 한글 조합 */
function composeSyllable(ci, ji, gi) {
    return String.fromCharCode(0xac00 + (ci * 588) + (ji * 28) + gi);
}

function applyDuEum(char) {
    const hangulBase = 0xac00;
    const choseongList = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
    const jungseongList = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
    const code = char.charCodeAt(0) - hangulBase;
    if (code < 0 || code > 11171) return char;

    const ci = Math.floor(code / 588), ji = Math.floor((code % 588) / 28), gi = code % 28;
    const c = choseongList[ci], j = jungseongList[ji];
    const conditions = [
        { c: ["ㄹ"], j: ["ㅑ", "ㅕ", "ㅛ", "ㅠ", "ㅣ", "ㅖ"], r: "ㅇ" },
        { c: ["ㄹ"], j: ["ㅏ", "ㅐ", "ㅗ", "ㅜ", "ㅡ", "ㅚ"], r: "ㄴ" },
        { c: ["ㄴ"], j: ["ㅕ", "ㅛ", "ㅠ", "ㅣ"], r: "ㅇ" }
    ];
    for (let cond of conditions) {
        if (cond.c.includes(c) && cond.j.includes(j)) {
            return String.fromCharCode(hangulBase + choseongList.indexOf(cond.r) * 588 + (ji * 28) + gi);
        }
    }
    return char;
}



function initJobState(job) {
    let state = { job: job, lost_abilities: false, disabled_turns: 0, no_yudo_turns: 0, no_hanbang_turns: 0, no_du_eum_turns: 0, only_even_turns: 0, only_odd_turns: 0, only_length_2_turns: 0, no_length_2_turns: 0, only_root_turns: 0, last_route_only_turns: 0, knight_lock_turns: 0, knight_silence_turns: 0, only_length_2_forever: false, no_all_batchim_turns: 0, limited_length: 0, min_length: 0, no_long_yudo_turns: 0, destroyed_active_abilities: [], used_active_this_turn: false, absolutely_disabled: 0, bulletproof_debuff_turns: 0, comet_final_lock: false };

    // 해커
    if (job === "해커") {
        state.jojak_cooldown = 0; state.jojak_uses = 0; state.jojak_active = 0;
        state.bokje_uses = 0;
        state.chotohwa_cooldown = 0; state.chotohwa_uses = 0; state.chotohwa_active = 0;
    }
    // 투자자
    else if (job === "투자자") {
        state.investor_stock = 20; state.juga_jojak_cooldown = 0; state.juga_jojak_uses = 0; state.juga_jojak_active = false;
    }
    // 환자
    else if (job === "환자") {
        state.opcd_cooldown = 0; // 강박증
        state.hallucination_uses = 0; state.patient_no_kill_turns = 0; // 환각증
    }
    // 수집가
    else if (job === "수집가") {
        state.collected_syllables = [];
        state.make_cooldown = 0;
        state.mine_cooldown = 0; state.mine_uses = 0; state.mine_active = 0;
    }
    // 감시자
    else if (job === "감시자") {
        state.watch_count = 30;
        state.detect_cooldown = 0; state.detect_uses = 0; state.detect_active_turns = 0;
    }
    // 뜀틀선수
    else if (job === "뜀틀선수") {
        state.vault_cooldown = 0; state.vault_uses = 0; state.vault_max = 3;
        state.hurdle_uses = 0;
    }
    // 전우치
    else if (job === "전우치") {
        state.afterimage_uses = 0;
        state.lightning_cooldown = 0; state.lightning_uses = 0;
    }
    // 기관사
    else if (job === "기관사") {
        state.train_stations = 8;
    }
    // 늑대인간
    else if (job === "늑대인간") {
        state.roar_cooldown = 0;
    }
    // 시프터
    else if (job === "시프터") {
        state.shift_uses = 0;
    }
    // 비밀요원
    else if (job === "비밀요원") {
        state.targets = []; state.target_active_turns = 0;
        state.capture_cooldown = 0; state.capture_uses = 0;
    }
    // 67
    else if (job === "67") {
        state.sixtyseven_cooldown = 0;
    }
    // 사과
    else if (job === "사과") {
        state.apple_passive_cooldown = 0; state.apple_debuff_turns = 0; state.apple_unused_turns = 0;
        state.sagua_uses = 0;
    }
    // 시인
    else if (job === "시인") {
        state.poetic_2_cooldown = 0; state.poetic_2_uses = 0;
        state.poetic_allow_cooldown = 0; state.poetic_allow_uses = 0;
    }
    // 공룡
    else if (job === "공룡") {
        state.swallow_cooldown = 0; state.swallow_uses = 0; state.swallow_active = false;
        state.breath_uses = 0;
        state.tail_uses = 0; state.tail_active = false;
    }
    // 마법사
    else if (job === "마법사") {
        state.void_cooldown = 0; state.void_uses = 0;
        state.explosion_uses = 0;
    }
    // 사신
    else if (job === "사신") {
        state.execution_count = 44;
        state.death_cooldown = 0; state.death_uses = 0;
    }
    // 수학자
    else if (job === "수학자") {
        state.math_result = 0;
        state.calc_cooldown = 0; state.calc_uses = 0;
        state.add_cooldown = 0; state.add_uses = 0;
        state.sub_uses = 0;
        state.mul_uses = 0;
        state.correct_cooldown = 0; state.correct_uses = 0; state.used_active_this_turn = false;
        state.calculus_uses = 0;
    }
    // 과학자
    else if (job === "과학자") {
        state.experiment_cooldown = 0;
        state.experiment_success_total = 0;
        state.dna_cooldown = 0; state.dna_uses = 0;
        state.dna_target = null; state.dna_tracking = false; state.dna_success_streak = 0;
        state.challenge_uses = 0; state.challenge_active = false;
    }
    // 갈릴레오
    else if (job === "갈릴레오") {
        state.galileo_moons = { io: false, europa: false, ganymede: false, callisto: false };
    }
    // 작곡가
    else if (job === "작곡가") {
        state.compose_notes = [];
        state.compose_units = 0;
        state.compose_target_units = 8;
        state.split_uses = 0;
        state.split_pending = false;
        state.rest_cooldown = 0;
    }
    // 스폰지밥
    else if (job === "스폰지밥") {
        state.money = 4000;
        state.burger_cooldown = 0;
        state.fries_cooldown = 0;
        state.bonus_cooldown = 0; state.bonus_uses = 0; state.bonus_active = false;
        state.robber_cooldown = 0; state.robber_uses = 0; state.robber_turns = 0; state.robber_skip_current = false;
    }
    // 나이트
    else if (job === "나이트") {
        state.knight_pattern = [];
        state.checkmate_cooldown = 0; state.checkmate_uses = 0;
        state.exchange_uses = 0; state.exchange_pending = false; state.exchange_active = false;
        state.cry_uses = 0;
    }
    // 생존자
    else if (job === "생존자") {
        state.signal_cooldown = 0; state.signal_sequence = "";
        state.rescue_cooldown = 0; state.rescue_uses = 0;
        state.rescue_no_kill_turns = 0;
    }
    // 악당
    else if (job === "악당") {
        state.barrier_cooldown = 0; state.barrier_uses = 0; state.barrier_turns = 0; state.barrier_chosungs = [];
        state.distort_cooldown = 0; state.distort_uses = 0;
    }
    // 기자
    else if (job === "기자") {
        state.report_cooldown = 0; state.report_uses = 0; state.report_turns = 0;
    }
    // 검객
    else if (job === "검객") {
        state.stab_cooldown = 0; state.stab_uses = 0;
        state.slice_cooldown = 0; state.slice_uses = 0; state.slice_active = false;
    }
    // 마하트마간디
    else if (job === "마하트마간디") {
        state.gandhi_cooldown = 0; state.gandhi_stacks = 0;
        state.suppress_cooldown = 0;
    }
    // 은하계전사
    else if (job === "은하계전사") {
        state.star_cooldown = 0; state.star_stacks = 0; state.star_permanent_done = false; state.star_ult_used = false;
    }
    // 혜성전사
    else if (job === "혜성전사") {
        state.comet_passive_cooldown = 0;
        state.comet_barrier_turns = 0;
        state.comet_barrier_chosungs = [];
        state.comet_seong_count = 0;
        state.comet_hye_count = 0;
        state.comet_final_applied = false;
    }
    // 수리사
    else if (job === "수리사") {
        state.bulletproof_cooldown = 0;
        state.bulletproof_uses = 6;
        state.repair_cooldown = 0; state.repair_uses = 0; state.repair_active = false;
    }
    // 고죠
    else if (job === "고죠") {
        state.gongcheo_cooldown = 0;
        state.gongcheo_uses = 6;
        state.absolutely_disabled = 0;
    }
    // 우라늄
    else if (job === "우라늄") {
        state.radiation_cooldown = 0;
        state.uranium_two_streak = 0;
        state.uranium_gamma_chain = [];
        state.fission_uses = 0;
        state.fission_active = false;
        state.fission_syllables = [];
    }

    return state;
}

const ALL_JOBS = ["해커", "투자자", "환자", "수집가", "감시자", "뜀틀선수", "전우치", "기관사", "늑대인간", "시프터", "비밀요원", "67", "사과", "시인", "공룡", "마법사", "사신", "수학자", "과학자", "갈릴레오", "작곡가", "스폰지밥", "나이트", "생존자", "악당", "기자", "검객", "마하트마간디", "은하계전사", "혜성전사", "수리사", "우라늄", "고죠"];

const JOB_DIALOGUES = {
    "해커": { start: "회로를 열고 규칙의 틈을 노린다.", active: { "조작": "기록을 비틀어 같은 단어를 다시 꺼낸다.", "복제": "걸린 제약을 훔쳐 상대에게 넘긴다.", "초토화": "판을 태울 준비를 마쳤다." }, passive: { "초토화": "초토화가 터져 상대 능력을 지워 버린다." } },
    "투자자": { start: "첫 턴부터 수익 계산을 시작한다.", active: { "주가 조작": "다음 변동을 억지로 하락 쪽으로 민다." }, passive: { "투자의 귀재": "상대 단어를 보고 주가를 다시 계산한다." } },
    "환자": { start: "상대의 리듬이 흐트러질 때까지 버틴다.", active: { "환각증": "앞말잇기 환각을 씌운다." }, passive: { "강박증": "홀수 길이를 보고 짝수만 허용하겠다고 몰아붙인다." } },
    "수집가": { start: "흩어진 음절을 차곡차곡 주워 담는다.", active: { "제작": "모은 음절을 이어 새 단어를 만든다.", "채굴": "이번에는 단어 전체를 긁어 모은다." }, passive: { "수집": "상대가 남긴 음절을 챙긴다.", "추가단어 사용": "직접 만든 단어로 상대 흐름을 끊는다." } },
    "감시자": { start: "예외 단어 하나까지 전부 지켜본다.", active: { "탐지": "다음 위반은 더 크게 적발하겠다고 경고한다." }, passive: { "감시": "규칙 위반을 세고 감시 수를 깎는다." } },
    "뜀틀선수": { start: "타이밍만 오면 한 번에 뛰어오를 생각이다.", active: { "허들 넘기": "한 번 더 뛸 여유를 만든다." }, passive: { "뜀틀": "도약으로 상대 흐름을 끊어 버린다." } },
    "전우치": { start: "사라진 길도 억지로 이어 붙일 준비를 한다.", active: { "직격뢰": "지정한 단어를 번개로 지워 버린다." }, passive: {} },
    "기관사": { start: "정해진 턴마다 역에 멈출 생각으로 출발한다.", active: {}, passive: { "운행": "역에 정차하며 상대의 선택지를 좁힌다." } },
    "늑대인간": { start: "포효 한 번으로 판세를 뒤집겠다고 으르렁거린다.", active: {}, passive: { "포효": "단어 속 울음소리로 상대를 위축시킨다." } },
    "시프터": { start: "모음 하나만 바꿔도 판이 달라진다고 믿는다.", active: { "시프트": "이을 음절의 모음을 한 칸 밀어 버린다." }, passive: {} },
    "비밀요원": { start: "타깃을 찍고 조용히 숨을 고른다.", active: { "포획": "도망칠 수 없는 위치까지 몰아넣는다." }, passive: { "타깃 확보": "후속 단어를 미리 포착한다.", "타깃 적중": "예상한 타깃이 걸려들었다." } },
    "67": { start: "여섯과 일곱만으로 상대를 조여 온다.", active: {}, passive: { "67": "유도 금지 턴을 길게 누적시킨다." } },
    "사과": { start: "천천히 익힌 디버프로 상대를 묶으려 한다.", active: { "사구아": "오래 버티는 봉인을 걸어 둔다." }, passive: { "삭와": "사과 디버프를 더 짙게 남긴다." } },
    "시인": { start: "짧은 운율로 판의 호흡을 바꾸려 한다.", active: { "2음절": "상대를 두 글자 리듬에 묶는다.", "시적 허용": "두음법칙의 흐름을 끊어 놓는다." }, passive: {} },
    "공룡": { start: "거대한 몸으로 기보째 흔들 준비를 한다.", active: { "삼키기": "방금 지나간 단어를 통째로 삼킨다.", "브레스": "숨결로 유도단어를 막아 낸다.", "꼬리 날리기": "꼬리로 다음 제약을 털어낸다." }, passive: {} },
    "마법사": { start: "부작용까지 계산에 넣고 주문을 고른다.", active: { "공허": "끝음절의 종성을 비워 버린다.", "폭발": "쌓인 제약을 한 번에 날려 버린다." }, passive: {} },
    "사신": { start: "처형 수를 세며 조용히 거리를 좁힌다.", active: { "사형 선고": "남은 숫자를 들이밀며 선고를 내린다." }, passive: { "처형": "단어 길이만큼 처형 수를 줄인다." } },
    "수학자": { start: "결과 수 20만 바라보고 계산을 이어 간다.", active: { "계산": "지금까지의 결과를 확인한다.", "덧셈": "받은 단어 길이를 더한다.", "뺄셈": "받은 단어 길이를 뺀다.", "곱셈": "받은 단어 길이만큼 곱한다.", "교정": "결과 수를 미세하게 조정한다.", "미적분": "상대의 능력을 잠시 멈춘다." }, passive: {} },
    "과학자": { start: "이번엔 끝말잇기 자체를 실험대로 삼겠다고 중얼거린다.", active: { "DNA파괴": "표적 능력을 정하고 연속 실험을 준비한다.", "도전": "금지된 영역까지 연구 범위를 넓힌다." }, passive: { "실험": "특정 자모가 많은 단어를 보고 실험을 성공시킨다." } },
    "갈릴레오": { start: "망원경을 들고 목성의 위성을 하나씩 찾을 생각이다.", active: {}, passive: { "관측": "초성과 종성을 분석해 위성을 찾아낸다.", "지동설": "네 개의 위성이 모두 모습을 드러냈다.", "관성의 법칙": "쌍자음으로 끝나는 단어는 받아들이지 않는다." } },
    "작곡가": { start: "상대 단어 길이를 악보로 옮길 생각으로 박자를 센다.", active: { "쪼개기": "다음 음표를 더 잘게 쪼갤 준비를 한다.", "쉼표": "남은 박자를 쉼표로 채워 마디를 닫는다." }, passive: { "작곡": "상대가 남긴 길이를 음표로 적어 넣는다.", "완성": "한 마디가 끝나며 악보 효과가 울린다.", "즉흥 승리": "8분음표가 섞인 마디가 완성되었다." } },
    "스폰지밥": { start: "저금통을 꼭 끌어안고 이번 판도 돈 냄새를 맡는다.", active: { "게살버거": "게살버거로 상대의 공격단어를 막아 둔다.", "감자튀김": "바삭한 제약으로 짝수 길이만 강요한다.", "보너스": "다음 수익을 두 배로 불린다.", "강도 채용": "위험을 감수하고 은행 습격 수익을 굴린다." }, passive: { "저금통": "상대가 말할 때마다 저금통에 돈을 모은다." } },
    "나이트": { start: "말머리를 고쳐 쥐고 체크메이트와 울음을 함께 준비한다.", active: { "체크메이트": "루트만 남기는 압박으로 상대 수를 막는다.", "교환": "다음 차례에는 아무 루트단어로 말을 바꿔 탄다.", "울음": "히힝 하고 울어 본다." }, passive: { "L자 도약": "2-4-2 리듬이 맞으면 상대를 봉쇄한다." } },
    "생존자": { start: "끝까지 남기 위해 신호를 하나씩 쌓는다.", active: { "긴급 구조": "기보를 뒤집어 새 구조선을 만든다." }, passive: { "신호": "신호를 한 칸 더 쌓는다.", "오신호": "신호가 어긋나도 다시 시작한다." } },
    "악당": { start: "결계가 닫히면 도망칠 틈은 없다고 웃는다.", active: { "결계": "판 위에 결계를 펼쳐 둔다.", "왜곡": "이미 열린 결계를 비틀어 버린다." }, passive: {} },
    "기자": { start: "거짓 보도로 판세를 바꿀 기회를 노린다.", active: { "거짓 보도": "왜곡된 보도를 전개한다." }, passive: {} },
    "검객": { start: "한 번 찌르면 흐름이 꺾일 거라 확신한다.", active: { "찌르기": "짧고 정확하게 상대를 묶는다.", "가르기": "받은 단어를 둘로 갈라 길을 바꾼다." }, passive: {} },
    "마하트마간디": { start: "상대의 거친 수를 끝까지 기록하겠다고 다짐한다.", active: { "억제": "쌓인 비폭력으로 상대를 눌러 둔다." }, passive: { "비폭력": "거친 수를 한 번 더 기록한다.", "비폭력 능력": "능력 사용까지 모두 스택으로 바꿔 둔다." } },
    "은하계전사": { start: "별과 달의 이름을 남기며 싸울 준비를 한다.", active: {}, passive: { "별인 듯 달 아닌 별": "별과 달의 흔적으로 상대를 묶는다.", "벨": "이번엔 끝음절을 벨로 남긴다.", "볠": "더 강한 흔적으로 상대 능력을 꺼 버린다." } },
    "혜성전사": { start: "혜성의 궤적으로 결계를 그려 둘 생각이다.", active: {}, passive: { "핼리 혜성": "성과 혜의 흔적으로 결계를 열고 닫는다.", "영구 결계": "궤적이 굳어져 상대의 끝음을 영구히 좁힌다." } },
    "수리사": { start: "망가진 음절도 고쳐서 길을 만들 생각이다.", active: { "수리": "이을 음절을 억지로 손봐 둔다." }, passive: { "방탄": "상대의 공격을 튕겨내고 제약을 건다." } },
    "고죠": { start: "천상천하 유아독존. 무한의 너머를 보여주마.", active: { "무량공처": "내 영역 속에서 모든 것을 멈춘다." }, passive: { "무하한": "닿을 수 없는 무한의 벽을 세운다." } },
    "우라늄": { start: "보이지 않는 방사선으로 판 전체를 오염시킨다.", active: { "핵분열": "첫음절 바깥의 틈까지 길로 바꾼다." }, passive: { "알파선": "받침이 꽉 찬 단어를 한동안 막아 둔다.", "베타선": "상대 능력을 잠시 멈춰 세운다.", "감마선": "상대를 두 글자 리듬에 영구히 가둔다." } }
};

function getJobDialogue(job, section, key, fallback) {
    let pack = JOB_DIALOGUES[job] || {};
    if (section === "start") return pack.start || fallback || "";
    let area = pack[section] || {};
    return area[key] || fallback || "";
}

function getActiveAbilityNames(job) {
    let pack = JOB_DIALOGUES[job] || {};
    let active = pack.active || {};
    return Object.keys(active);
}

function isSpongebobWanted(state) {
    return !!(state && state.job === "스폰지밥" && (state.robber_turns > 0 || state.robber_skip_current));
}

function getSpongebobFoodPrice(state, foodName) {
    let basePrice = 0;
    if (foodName === "게살버거") basePrice = 6000;
    else if (foodName === "감자튀김") basePrice = 8000;
    if (basePrice > 0 && isSpongebobWanted(state)) basePrice += 3000;
    return basePrice;
}

function addSpongebobMoney(state, amount) {
    let gain = amount;
    let doubled = false;
    if (state && state.bonus_active) {
        gain *= 2;
        doubled = true;
        state.bonus_active = false;
    }
    state.money += gain;
    return { amount: gain, doubled: doubled };
}



function nextCharForWord(game) {
    if (game.history.length === 0) return "자유";
    return game.lastLetter.s1 !== game.lastLetter.s2 ?
        game.lastLetter.s2 + "(" + game.lastLetter.s1 + ")" : game.lastLetter.s2;
}

// --- 직업 정보 사전 (1ㅈㅂ 커맨드용) ---
const JOB_INFO = {
    "해커": "[ 채린룰 해커 직업 정보 ]\n\n< 조작 > - 쿨타임 4턴 | 3회용\n\n2턴간 이미 사용한 단어를 또 사용할 수 있습니다.\n\n\n< 복제 > - 1회용\n\n현재 디버프를 모두 제거하고 상대방에게 그대로 적용합니다.\n7턴부터 사용 가능합니다.\n\n\n< 초토화 > - 쿨타임 7턴 | 2회용\n\n1턴간 상대방이 유도단어나 4글자 이상의 단어를 사용하면 가진 패시브와 능력을 모두 잃습니다.\n7턴부터 사용 가능합니다.",
    "투자자": "[ 채린룰 투자자 직업 정보 ]\n\n< 투자의 귀재 > - 패시브(자동 시전 능력)\n\n게임이 시작되면 주가가 20으로 설정됩니다.\n해당 주가는 상대방이 사용한 단어에 따라 변동됩니다.\n글자 수가 짝수일 땐 주가에서 글자 수만큼을 차감합니다.\n글자 수가 홀수일 땐 주가에서 글자 수만큼을 추가합니다.\n[변동된 주가 ≤ 현재 턴 수] 수식에 해당하면 게임에서 승리합니다.\n\n\n< 주가 조작 > - 쿨타임 7턴 | 2회용\n\n다음 차례에 { 투자의 귀재 } 패시브 발동 시 주가를 무조건 차감합니다.",
    "환자": "[ 채린룰 환자 직업 정보 ]\n\n< 강박증 > - 패시브(자동 시전 능력) | 쿨타임 3턴\n\n상대방이 글자 수가 홀수인 단어를 사용하면 1턴간 글자 수가 짝수인 단어만 사용할 수 있게 합니다.\n또한, 상대방이 1턴간 패시브와 능력, 유도단어를 사용할 수 없게 합니다.\n\n\n< 환각증 > - 1회용\n\n상대방이 1턴간 마지막 단어의 첫음절로 끝나는 단어만 사용할 수 있게 합니다.(앞말잇기)\n단, 환자는 능력 사용 직후에 현재 이을 음절로 끝나는 3글자 이하의 단어만 사용할 수 있습니다.\n또한, 환자는 능력 사용 후 2턴간 한방단어와 유도단어를 사용할 수 없습니다.\n이 능력은 루트단어를 받았을 때만 사용 가능합니다.\n7턴부터 사용 가능합니다.",
    "수집가": "[ 채린룰 수집가 직업 정보 ]\n\n< 수집 > - 패시브(자동 시전 능력)\n\n상대방이 사용한 단어의 첫 번째 음절을 수집하여 저장합니다.\n{ 제작 } 능력으로 만들어진 단어는 한방단어, 유도단어, 루트단어, 일반단어 중 그 무엇도 아닌 '추가단어'로 취급되며, 누구든 사용할 수 있습니다.\n수집가 직업이 추가단어를 사용하게 되면 상대방은 1턴간 패시브와 능력을 사용할 수 없습니다.\n\n\n< 제작 > - 쿨타임 6턴\n\n수집한 음절을 소모하여 2글자 이상의 추가단어를 생성합니다.\n생성된 추가단어는 한 번 사용할 수 있습니다.\n명령어는 [2제작 (단어)] 형태로 사용합니다.\n\n\n< 채굴 > - 쿨타임 6턴 | 2회용\n\n1턴간 { 수집 } 패시브 발동 시 상대방이 사용한 단어의 모든 음절을 수집합니다.",
    "감시자": "[ 채린룰 감시자 직업 정보 ]\n\n< 감시 > - 패시브(자동 시전 능력)\n\n게임 시작 후 감시 수가 30으로 설정됩니다.\n상대방이 유도단어를 사용하면 감시 수를 4 차감합니다.\n상대방이 한방단어를 사용하면 감시 수를 8 차감합니다.\n상대방이 루트단어를 사용하면 감시 수를 2 차감합니다.\n감시자에게 디버프가 존재하면 매턴 디버프 하나당 감시 수를 1 차감합니다.\n감시 수가 0 이하가 되면 무기한으로 이을 음절에 상관없이 그 어떤 단어나 사용할 수 있습니다.\n패시브 불가 효과를 무시합니다.\n\n\n< 탐지 > - 쿨타임 6턴 | 2회용\n\n상대방이 1턴간 능력을 사용하면 하나당 감시 수를 10 깎습니다.\n또한, 다음 차례에 { 감시 } 패시브 발동 시 감시 수를 2배로 차감합니다.",
    "뜀틀선수": "[ 채린룰 뜀틀선수 직업 정보 ]\n\n< 뜀틀 > - 패시브(자동 시전 능력) | 쿨타임 5턴 | 3회용\n\n언제든지 '뜀틀' 단어를 사용할 수 있습니다.\n사용 시 상대방은 1턴간 유도단어를 사용할 수 없으며 패시브와 능력을 사용할 수 없습니다.\n\n\n< 허들 넘기 > - 1회용\n\n22턴 이상이 되면 사용 가능합니다.\n{ 뜀틀 } 패시브의 기회를 1회 추가하고 쿨타임을 초기화합니다.",
    "전우치": "[ 채린룰 전우치 직업 정보 ]\n\n< 잔상 > - 패시브(자동 시전 능력) | 1회용\n\n더 이상 이어나갈 수 있는 단어가 없을 때, 아무 루트단어로 이어갈 수 있습니다.\n이미 사용한 단어에 의해 이어나갈 수 없는 경우엔 발동하지만, 디버프로 인해 이을 단어가 없거나 시스템상으로 단어 구조가 변경되어 이을 단어가 없는 경우는 발동하지 않습니다.\n6턴부터 사용 가능합니다.\n\n\n< 직격뢰 > - 쿨타임 7턴 | 4회용\n\n특정 유도단어나 루트단어가 사라지게 하여 영구적으로 아무도 사용할 수 없도록 합니다.\n'2직격뢰 (단어)' 형식으로 사용합니다.",
    "기관사": "[ 채린룰 기관사 직업 정보 ]\n\n< 운행 > - 패시브(자동 시전 능력)\n\n3의 배수인 턴이 되면 전철역에 정차하여 1턴간 상대방이 패시브와 능력 및 유도단어를 사용할 수 없게 합니다.\n전철역 수는 총 8개며, 상대방은 글자 수가 종점까지 남은 역 수보다 큰 단어를 사용할 수 없습니다.(최소 글자 수는 2입니다)\n종점에 도착하면 승리합니다.\n단, 기관사 대 기관사 대전에서는 패시브 불가 효과를 주지 않으며, 종점 도착 시 무승부 처리됩니다.",
    "늑대인간": "[ 채린룰 늑대인간 직업 정보 ]\n\n< 포효 > - 패시브(자동 시전 능력) | 쿨타임 2턴\n\n사용한 단어에 [ㅇ] 또는 [ㅎ]이 포함된 개수에 따라 상대방에게 디버프를 부여합니다.\n개수가 1개 이상이면 2턴간 짝수 글자의 단어만 사용 가능하게 합니다.\n개수가 3개 이상이면 추가적으로 1턴간 능력을 사용할 수 없게 합니다.",
    "시프터": "[ 채린룰 시프터 직업 정보 ]\n\n< 시프트 > - 3회용\n\n현재 이을 음절의 중성을 다음 중성으로 넘깁니다.\n넘긴 직후 두음법칙은 적용되지 않으며, 중성의 순서는 [ᅡᅢᅣᅤᅥᅦᅧᅨᅩᅪᅫᅬᅭᅮᅯᅰᅱᅲᅳᅴᅵ]입니다.\n단, 현재 이을 음절로 시작하는 단어가 없으면 이 능력을 사용할 수 없습니다.",
    "비밀요원": "[ 채린룰 비밀요원 직업 정보 ]\n\n< 타깃 확보 > - 패시브(자동 시전 능력)\n\n단어를 입력하면 입력한 단어로부터 이어질 수 있는 단어를 최대 3개까지 타깃 단어로 설정합니다.\n4글자 이하의 유도단어와 루트단어 중 긴 단어가 우선 선정되며, 길이가 같은 단어의 경우 ㄱㄴㄷ순으로 선정됩니다.\n상대방이 타깃 단어를 사용하면 상대방은 1턴간 패시브와 능력을 사용할 수 없고, 2턴간 타깃으로 설정되어 { 포획 } 능력의 대상이 되며, 5글자 이상의 단어를 사용할 수 없습니다.\n이 패시브가 다시 발동할 때까지 타깃 단어는 변동되지 않습니다.\n\n\n< 포획 > - 쿨타임 3턴 | 2회용\n\n상대방이 타깃으로 설정되었을 때만 사용 가능합니다.\n지정한 음절로 시작하는 사용 가능한 유도단어와 루트단어 4개를 사라지게 하여 영구적으로 아무도 사용하지 못하게 합니다.\n길이가 긴 단어가 우선으로 사라지며, 길이가 같은 단어의 경우 ㄱㄴㄷ순으로 사라집니다.\n또한, 상대방이 2턴간 패시브와 능력을 사용할 수 없게 합니다.\n이 능력은 능력 사용 불가 효과를 무시합니다.\n능력은 '2포획 (음절)' 형식으로 사용합니다.",
    "67": "[ 채린룰 67 직업 정보 ]\n\n< 67 > - 패시브(자동 시전 능력) | 쿨타임 1턴\n\n6글자 단어를 사용하면 상대방은 7턴간 유도단어를 사용할 수 없습니다.\n이미 유도 불가 효과가 있다면 7턴 증가시키며, 없다면 1턴간 한방단어를 사용할 수 없게 합니다.\n상대방의 유도 불가 효과의 턴 수가 67턴 이상이 된다면 게임에서 즉시 승리합니다.\n패시브 불가 효과를 무시합니다.",
    "사과": "[ 채린룰 사과 직업 정보 ]\n\n< 삭와 > - 패시브(자동 시전 능력) | 쿨타임 2턴\n\n입력한 단어의 초성이나 종성에 포함된 [ㅅㄱㄴㅁㅇ]의 개수가 2개 이상이면 3턴간 상대방에게 사과 디버프를 부여합니다.\n이미 사과 디버프가 있으면 2턴 연장합니다.\n사과 디버프는 3글자 이상의 한방단어와 5글자 이상의 유도단어를 사용하지 못하도록 합니다.\n이 패시브가 1회 이상 사용되지 않은 채로 10턴 이상이 되었을 때 이 패시브가 발동하면 게임에서 즉시 승리합니다.\n\n\n< 사구아 > - 1회용\n\n상대방이 3턴간 패시브와 능력을 사용하지 못하게 합니다.",
    "시인": "[ 채린룰 시인 직업 정보 ]\n\n< 2음절 > - 쿨타임 2턴 | 3회용\n\n상대방이 1턴간 두 글자 단어만 사용할 수 있게 합니다.\n\n\n< 시적 허용 > - 쿨타임 3턴 | 2회용\n\n상대방이 1턴간 두음법칙을 사용할 수 없게 합니다.",
    "공룡": "[ 채린룰 공룡 직업 정보 ]\n\n< 삼키기 > - 쿨타임 7턴 | 2회용\n\n마지막으로 사용된 단어를 삼키고, 그 이전 단어를 기준으로 단어를 잇습니다.\n삼킨 직후엔 글자 수가 3글자 이하인 단어만 사용할 수 있고, 유도단어와 한방단어를 사용할 수 없으며, 두음법칙 또한 사용할 수 없습니다.\n\n\n< 브레스 > - 1회용\n\n상대방이 1턴간 유도단어를 사용할 수 없도록 합니다.\n10턴부터 사용 가능합니다.\n\n\n< 꼬리 날리기 > - 1회용\n\n다음 차례에 능력 사용 불가 디버프를 무시합니다.\n13턴부터 사용할 수 있습니다.",
    "마법사": "[ 채린룰 마법사 직업 정보 ]\n\n< 부작용 > - 패시브(자동 시전 능력)\n\n마법사는 14턴까지 한방단어와 유도단어를 사용할 수 없습니다.\n\n\n< 공허 > - 쿨타임 4턴 | 5회용\n\n현재 이을 음절의 종성을 제거합니다.\n제거 후 두음법칙을 사용할 수 있습니다.\n\n\n< 폭발 > - 1회용\n\n현재 가진 모든 디버프를 제거합니다.\n14턴부터 사용 가능합니다.",
    "사신": "[ 채린룰 사신 직업 정보 ]\n\n< 처형 > - 패시브(자동 시전 능력) | 4444회용\n\n게임 시작 후 처형 수가 44로 설정됩니다.\n사신이 입력하는 단어의 글자 수만큼 처형 수가 차감되며, 8글자 이상의 단어를 입력하면 처형식을 개최하여 상대방은 1턴간 패시브와 능력, 그리고 한방단어와 유도단어를 사용할 수 없습니다.\n\n\n< 사형 선고 > - 쿨타임 4턴 | 4444회용\n\n능력 사용 직후 처형 수가 18 이하면 상대방은 1턴간 글자 수가 4글자 이하인 단어를 사용할 수 없습니다.\n처형 수가 4 이하면 게임에서 즉시 승리합니다.",
    "수학자": "[ 채린룰 수학자 직업 정보 ]\n\n< 계산 > - 쿨타임 1턴 | 2회용\n\n능력 사용 시 결과 수가 20이면 게임에서 승리합니다.\n결과 수는 게임 시작 후 바로 0으로 설정되며, 변동되어도 결과 수 자체를 알려 주지 않으므로 직접 계산하여야 합니다.\n해당 능력 사용 시 결과 수가 공개됩니다.\n\n\n< 덧셈 > - 쿨타임 2턴 | 3회용\n\n능력 사용 직전에 받은 단어의 글자 수만큼을 결과 수에 더합니다.\n\n\n< 뺄셈 > - 2회용\n\n능력 사용 직전에 받은 단어의 글자 수만큼을 결과 수에서 뺍니다.\n\n\n< 곱셈 > - 1회용\n\n능력 사용 직전에 받은 단어의 글자 수만큼을 결과 수에 곱합니다.\n\n\n< 교정 > - 쿨타임 4턴 | 2회용\n\n결과 수에 1을 더합니다.\n이 능력 사용 후 다른 능력을 연달아 사용할 수 없습니다.\n\n\n< 미적분 > - 1회용\n\n상대방이 1턴간 패시브와 능력을 사용할 수 없게 합니다.",
    "과학자": "[ 채린룰 과학자 직업 정보 ]\n\n< 실험 > - 패시브(자동 시전 능력) | 쿨타임 1턴\n\n초성이나 종성에 [ㅇㅅㅎ]이 총 4개 이상 포함된 단어를 사용하면 실험에 성공합니다.\n성공 시 상대방은 1턴간 한방단어와 유도단어, 능력, 패시브를 사용할 수 없습니다.\n실험 성공 횟수는 누적되며, 패시브 사용 불가 효과를 무시합니다.\n\n\n< DNA파괴 > - 쿨타임 8턴 | 2회용\n\n상대방의 액티브 능력 하나를 지정합니다.\n사용 다음 턴부터 실험에 2턴 연속으로 성공하면, 지정한 능력을 파괴합니다.\n파괴된 능력은 더 이상 사용할 수 없습니다.\n명령어는 '2DNA파괴 능력명' 형식으로 사용합니다.\n\n\n< 도전 > - 1회용\n\n실험에 15번 이상 성공했을 때 사용할 수 있습니다.\n사용 후에는 사전에 없는 단어도 영구적으로 사용할 수 있습니다.",
    "갈릴레오": "[ 채린룰 갈릴레오 직업 정보 ]\n\n< 관측 > - 패시브(자동 시전 능력)\n\n갈릴레오가 사용한 단어의 초성과 종성을 분석하여 목성의 위성을 발견합니다.\n단어에 포함된 초성과 종성의 집합이 다음 조건을 만족하면 해당 위성을 발견합니다.\n- {ㅇ}만 포함: 이오 발견\n- {ㅇ, ㄹ, ㅍ} 모두 포함: 유로파 발견\n- {ㄱ, ㄴ, ㅁ, ㄷ} 모두 포함: 가니메데 발견\n- {ㅋ, ㄹ, ㅅ, ㅌ} 모두 포함: 칼리스토 발견\n\n위성을 발견하면 상대방은 3턴간 끝음절이 루트음절인 단어만 사용할 수 있습니다.\n4개의 위성을 모두 발견하면 지동설이 증명되어 즉시 승리합니다.\n각 위성은 한 번만 발견할 수 있습니다.\n\n\n< 관성의 법칙 > - 패시브(자동 시전 능력)\n\n상대방은 끝음절의 초성이 ㄲ, ㄸ, ㅃ, ㅆ, ㅉ인 단어를 사용할 수 없습니다.",
    "작곡가": "[ 채린룰 작곡가 직업 정보 ]\n\n< 작곡 > - 패시브(자동 시전 능력)\n\n방금 상대방이 사용한 단어의 글자 수가 2글자라면 2분음표를, 4글자라면 4분음표를, 8글자라면 8분음표를 악보에 추가합니다.\n한 마디가 완성될 때 다음 효과가 부여됩니다.\n완성된 마디에 8분음표가 포함되었다면 게임에서 즉시 승리합니다.\n상대방은 4분음표가 포함된 개수만큼 턴 동안 유도단어를 사용할 수 없습니다.\n음표가 마디를 초과한다면 마디는 완성되지 않고 연장됩니다.\n패시브 사용 불가 효과를 무시합니다.\n\n\n< 쪼개기 > - 3회용\n\n다음 작곡 패시브 발동 시 박자가 쪼개집니다.\n2분음표는 4분음표로, 4분음표는 8분음표로 쪼개집니다.\n8분음표는 쪼개지지 않습니다.\n\n\n< 쉼표 > - 쿨타임 3턴\n\n현재 진행 중인 마디에 가능한 만큼 쉼표를 추가하여 마디를 즉시 완성합니다.\n그러나 작곡 패시브는 발동되지 않습니다.\n상대방은 1턴간 한방단어를 사용할 수 없습니다.",
    "스폰지밥": "[ 채린룰 스폰지밥 직업 정보 ]\n\n< 저금통 > - 패시브(자동 시전 능력)\n\n게임 시작 시 4000원을 가지고 시작합니다.\n상대방이 단어를 말할 때마다 글자 수 x 1000원만큼 저금통에 저금합니다.\n\n\n< 게살버거 > - 쿨타임 1턴\n\n가격은 6000원입니다.\n상대방은 1턴간 한방단어와 유도단어를 사용할 수 없습니다.\n\n\n< 감자튀김 > - 쿨타임 1턴\n\n가격은 8000원입니다.\n상대방은 2턴간 짝수 글자 수의 단어만 사용할 수 있습니다.\n\n\n< 보너스 > - 쿨타임 3턴 | 4회용\n\n다음에 들어오는 돈이 2배가 됩니다.\n\n\n< 강도 채용 > - 쿨타임 5턴 | 3회용\n\n가격은 30000원입니다.\n다음부터 2턴 동안 5000원씩 추가 수익이 들어옵니다.\n단, 현상수배에 걸려 그동안 게살버거와 감자튀김 가격이 3000원 상승하고, 5글자 이상의 단어를 사용할 수 없습니다.",
    "나이트": "[ 채린룰 나이트 직업 정보 ]\n\n< L자 도약 > - 패시브(자동 시전 능력)\n\n사용하는 단어의 글자 수가 [2글자 - 4글자 - 2글자] 순서를 이루면 발동합니다.\n발동 시 상대방은 2턴간 한방단어와 유도단어, 2글자 단어를 사용할 수 없고 1턴간 패시브와 능력을 사용할 수 없습니다.\n이미 적용 중이라면 지속 시간이 1턴씩 늘어납니다.\n\n\n< 체크메이트 > - 쿨타임 4턴 | 5회용\n\n상대방은 1턴간 두음법칙을 사용할 수 없고 2턴간 루트단어만 사용할 수 있습니다.\n\n\n< 교환 > - 1회용\n\n상대방이 한 턴을 보낸 뒤 다음 차례에 아무 루트단어를 사용할 수 있습니다.\n이때 중복 사용 제한을 무시합니다.\n\n\n< 울음 > - 1회용\n\n말이 울음소리를 냅니다.\n기능은 없습니다.",
    "생존자": "[ 채린룰 생존자 직업 정보 ]\n\n< 신호 > - 패시브(자동 시전 능력) | 쿨타임 1턴\n\n2글자 단어를 입력하면 [ · ] 모스부호 신호를 보냅니다.\n3글자 이상의 단어를 입력하면 [ - ] 모스부호 신호를 보냅니다.\n전체 모스부호 신호가 [ · · · - - - · · · - · - · - - ]가 되면 'SOS!' 신호가 완성되어 게임에서 즉시 승리합니다.\n신호를 잘못 입력하면 그 신호는 취소되지만, 상대방이 1턴간 3글자 이상의 유도단어를 사용할 수 없도록 합니다.\n\n\n< 긴급 구조 > - 쿨타임 7턴 | 2회용\n\n게임에서 사용된 단어 중 맨처음 2개의 단어를 제외한 전체 단어를 한 묶음으로 하여 뒤집고, 뒤집은 단어를 기준으로 게임을 진행합니다.\n[기차 차표 표범 범죄 죄인]이면 [인죄 죄범 범표]와 같이 뒤집힙니다.\n긴급 구조 발동 시 모든 디버프를 제거하지만, 1턴간 한방단어나 유도단어를 사용할 수 없습니다.\n한방단어나 유도단어를 받았을 때만 사용 가능합니다.",
    "악당": "[ 채린룰 악당 직업 정보 ]\n\n< 결계 > - 쿨타임 5턴 | 4회용\n\n능력 사용 시 마지막에 사용된 단어의 글자 수만큼의 턴간 지속되는 결계를 생성합니다.\n결계가 생성되면 결계 초성이 [ㄱㄴ]으로 설정되며, 상대방은 결계가 지속되는 동안 끝음절에 결계 초성이 포함된 단어를 사용할 수 없습니다.\n또한, 결계가 지속되는 동안 상대방이 입력하는 단어의 글자 수만큼 결계 초성이 늘어납니다.\n추가되는 순서는 [ㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ]입니다.\n결계 초성이 [ㅎ]까지 도달하면 결계가 끝날 때까지 더 이상 변동되지 않습니다.\n\n\n< 왜곡 > - 쿨타임 1턴 | 2회용\n\n결계 시전 중에만 사용할 수 있습니다.\n사용 즉시 1턴간 이때까지 진행된 결계 초성을 모두 왜곡합니다.\n[ㄱㄴㄷㄹ]인 경우, [ㅎㅍㅌㅋ]로 왜곡됩니다.\n왜곡된 결계 초성이 4개 이상인 경우 상대방은 1턴간 능력을 사용할 수 없습니다.",
    "기자": "[ 채린룰 기자 직업 정보 ]\n\n< 거짓 보도 > - 쿨타임 3턴 | 4회용\n\n1턴간 보도를 실시하며, 상대방이 보도 중에 한방단어나 유도단어를 사용하면 마지막 음절을 '삐'로 변경 후 상대방이 1턴간 능력과 유도단어를 사용하지 못하도록 합니다.\n상대방은 보도 중엔 패시브와 능력을 사용할 수 없으며, 두음법칙도 제한됩니다.",
    "검객": "[ 채린룰 검객 직업 정보 ]\n\n< 찌르기 > - 쿨타임 5턴 | 2회용\n\n상대방이 1턴간 패시브와 능력을 사용할 수 없게 합니다.\n또한, 1턴간 두음법칙을 사용할 수 없도록 합니다.\n5턴부터 사용 가능합니다.\n\n\n< 가르기 > - 쿨타임 3턴 | 3회용\n\n능력 사용 직전에 받은 단어를 반으로 가르고 단어를 이어갑니다.\n홀수 단어를 가르면 초성과 종성, 종성이 없으면 초성과 중성 기준으로 갈라집니다.(속 -> 소/ㄱ, 누 -> ㄴ/ㅜ)\n가른 직후 두음법칙은 적용되지 않으며, 현재 턴이 12턴 이상이 아니라면 가른 직후 한방단어와 유도단어를 사용할 수 없습니다.",
    "마하트마간디": "[ 채린룰 마하트마간디 직업 정보 ]\n\n< 비폭력 > - 패시브(자동 시전 능력) | 쿨타임 1턴\n\n상대방이 한방단어나 유도단어를 사용할 때마다 비폭력 스탯이 1회 추가됩니다.\n상대방이 능력을 사용하고 차례가 지나면 비폭력 스탯이 1회 추가됩니다.\n비폭력 스탯이 3회가 되면 개발자를 협박하여 게임을 즉시 승리로 종료합니다.\n패시브 불가 효과를 무시합니다.\n\n\n< 억제 > - 쿨타임 3턴\n\n비폭력 스탯을 1회 사용하여 상대방이 1턴간 유도단어를 사용할 수 없게 합니다.",
    "은하계전사": "[ 채린룰 은하계전사 직업 정보 ]\n\n< 별인 듯 달 아닌 별 > - 패시브(자동 시전 능력) | 쿨타임 1턴\n\n[별] 또는 [달]이 포함된 단어를 사용하면 상대방은 2턴간 끝음절이 루트음절인 단어만 사용 가능하고, 패시브와 능력을 사용할 수 없습니다.\n[별] 또는 [달]이 포함된 단어를 3번 이상 사용할 경우, 끝음절이 [벨]으로 변경됩니다.\n16턴 이전에 [벨]을 한 번이라도 주게 되면 16턴 이상이 되었을 때 단 한 번, 사용하는 단어의 끝음절이 [볠]으로 변하게 되며, 상대방은 무기한으로 끝음절 초성이 [ㅅㅍㄴㅂ] 중 하나인 단어만 사용 가능합니다.(이때, 더 이상 이 패시브는 발동하지 않습니다.)",
    "혜성전사": "[ 채린룰 혜성전사 직업 정보 ]\n\n< 핼리 혜성 > - 패시브(자동 시전 능력)\n\n혜성전사가 [성]이 포함된 단어를 사용하면 결계가 생성되거나 지속 시간이 1턴 늘어나며, 상대방은 1턴간 유도단어를 사용할 수 없습니다.\n결계가 생성되면 기본 3턴 동안 지속되며, 결계 초성이 [ㄱㄴ]으로 설정됩니다.\n상대방은 결계가 지속되는 동안 끝음절에 결계 초성이 포함된 단어를 사용할 수 없으며, 유도단어를 사용할 수 없습니다.\n\n결계가 지속되는 동안 상대방이 입력하는 단어의 글자 수만큼 결계 초성이 늘어납니다.\n추가되는 순서는 [ㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ]입니다.\n결계 초성이 [ㅎ]까지 도달하면 결계가 끝날 때까지 더 이상 변동되지 않습니다.\n\n혜성전사가 [혜]가 포함된 단어를 사용하면 결계 타이머가 0으로 초기화되고,\n상대방은 2턴간 유도단어를 사용할 수 없습니다.\n\n결계가 종료되면 이 패시브는 3턴간 사용할 수 없습니다.\n패시브 사용 불가 효과를 무시합니다.\n\n16턴 전까지 [성]이 포함된 단어를 5번 이상, [혜]가 포함된 단어를 1번 이상 사용했다면,\n상대방은 영구적으로 끝음절이 ㅎ, ㅅ인 단어만 사용 가능합니다.",
    "수리사": "[ 채린룰 수리사 직업 정보 ]\n\n< 방탄 > - 패시브(자동 시전 능력) | 쿨타임 1턴 | 6회용\n\n단어 입력 시 상대방은 1턴간 끝음절로 시작하는 단어가 10개 이하인 단어를 사용할 수 없습니다.\n\n\n< 수리 > - 쿨타임 6턴 | 4회용\n\n현재 이을 음절의 중성을 애매하게 수리합니다.\n수리 후 두음법칙을 사용할 수 있지만, 유도단어는 사용할 수 없습니다.\n[ㅏㅑㅓㅕㅣ] <-> [ㅜㅠㅗㅛㅡ]",
    "고죠": "[ 채린룰 고죠 직업 정보 ]\n\n< 무하한 > - 패시브(자동 시전 능력)\n\n게임 시작 후 상대방은 무기한으로 사용된 단어에 상관없이 정의상 되돌림단어(첫음절과 끝음절이 같은 단어)인 단어를 사용할 수 없습니다.\n\n\n< 무량공처 > - 쿨타임 2턴 | 6회용\n\n능력 사용 시 상대방은 1턴간 한방단어와 유도단어를 사용할 수 없습니다.\n또한, 1턴간 패시브와 능력을 ‘절대’ 사용할 수 없습니다.\n능력 사용 불가 효과를 무시합니다.",
    "우라늄": "[ 채린룰 우라늄 직업 정보 ]\n\n< 방사선 > - 패시브(자동 시전 능력) | 쿨타임 1턴\n\n사용한 단어 조건에 따라 방사선이 발동합니다.\n3글자 단어를 사용하면 알파선이 나가 상대방은 1턴간 모든 음절에 받침이 있는 단어를 사용할 수 없습니다.\n2글자 단어를 3번 연속으로 사용했다면 3번째 공격은 베타선이 나가 상대방은 2턴간 패시브와 능력을 사용할 수 없습니다.\n2글자, 3글자, 4글자, 5글자, 6글자 단어를 순서대로 연속으로 사용하면 감마선이 나가 상대방은 영구적으로 2글자 단어만 사용할 수 있습니다.\n\n\n< 핵분열 > - 1회용\n\n상대의 마지막 단어에서 첫음절이 아닌 아무 음절로 이어갈 수 있습니다.\n단, 능력 사용 직후에는 한방단어나 유도단어를 사용할 수 없습니다."
};

function buildStatusMsg(game) {
    let nextChar = game.lastLetter.s1 !== game.lastLetter.s2 ?
        game.lastLetter.s2 + "(" + game.lastLetter.s1 + ")" : game.lastLetter.s2;
    if (game.history.length === 0) nextChar = "자유";

    let historyStr = game.history.length > 0 ? game.history.join(" ") : "없음";
    let currentPlayer = game.players[game.currentTurnIndex];
    let nextPlayer = game.players[(game.currentTurnIndex + 1) % 2];

    let curState = game.playerStates[currentPlayer];
    let nxtState = game.playerStates[nextPlayer];

    function makePlayerInfo(name, state, otherState) {
        let buff = [];
        let debuff = [];
        let etc = [];
        let abilities = [];

        let title = "{ [" + state.job + "] " + name + " }";

        if (state.job === "해커") {
            abilities.push(
                "< 조작 > - 쿨타임 4턴 | " + (3 - state.jojak_uses) + "회 남음" + (state.jojak_cooldown > 0 ? " | " + state.jojak_cooldown + "턴 남음" : "") + "\n" +
                "2턴간 이미 사용한 단어를 또 사용할 수 있습니다."
            );
            abilities.push(
                "< 복제 > - " + (1 - state.bokje_uses) + "회 남음\n" +
                "현재 디버프를 모두 제거하고 상대방에게 그대로 적용합니다.\n7턴부터 사용 가능합니다."
            );
            abilities.push(
                "< 초토화 > - 쿨타임 7턴 | " + (2 - state.chotohwa_uses) + "회 남음" + (state.chotohwa_cooldown > 0 ? " | " + state.chotohwa_cooldown + "턴 남음" : "") + "\n" +
                "1턴간 상대방이 유도단어나 4글자 이상의 단어를 사용하면 가진 패시브와 능력을 모두 잃습니다.\n7턴부터 사용 가능합니다."
            );
            if (state.jojak_active > 0) buff.push("조작 활성화 중 (" + state.jojak_active + "턴)");
            if (state.chotohwa_active > 0) buff.push("초토화 장전됨 (상대가 유도단어 또는 4글자 이상 사용 시 능력 영구 박탈)");

        } else if (state.job === "투자자") {
            abilities.push(
                "< 투자의 귀재 > - 패시브(자동 시전 능력)\n" +
                "게임이 시작되면 주가가 20으로 설정됩니다.\n" +
                "해당 주가는 상대방이 사용한 단어에 따라 변동됩니다.\n" +
                "글자 수가 짝수일 땐 주가에서 글자 수만큼을 차감합니다.\n" +
                "글자 수가 홀수일 땐 주가에서 글자 수만큼을 추가합니다.\n" +
                "[변동된 주가 ≤ 현재 턴 수] 수식에 해당하면 게임에서 승리합니다.\n" +
                "↳ 현재 주가: " + state.investor_stock + " / 현재 턴 수: " + game.turnCount
            );
            abilities.push(
                "< 주가 조작 > - 쿨타임 7턴 | " + (2 - state.juga_jojak_uses) + "회 남음" + (state.juga_jojak_cooldown > 0 ? " | " + state.juga_jojak_cooldown + "턴 남음" : "") + "\n" +
                "다음 차례에 { 투자의 귀재 } 패시브 발동 시 주가를 무조건 차감합니다."
            );
            if (state.juga_jojak_active) buff.push("주가 조작 장전됨 (다음 차례 무조건 주가 차감)");

        } else if (state.job === "환자") {
            abilities.push(
                "< 강박증 > - 패시브(자동 시전 능력) | 쿨타임 3턴" + (state.opcd_cooldown > 0 ? " | " + state.opcd_cooldown + "턴 남음" : "") + "\n" +
                "상대방이 글자 수가 홀수인 단어를 사용하면 1턴간 글자 수가 짝수인 단어만 사용할 수 있게 합니다.\n" +
                "또한, 상대방이 1턴간 패시브와 능력, 유도단어를 사용할 수 없게 합니다."
            );
            abilities.push(
                "< 환각증 > - " + (1 - state.hallucination_uses) + "회 남음\n" +
                "상대방이 1턴간 마지막 단어의 첫음절로 끝나는 단어만 사용할 수 있게 합니다.(앞말잇기)\n" +
                "단, 환자는 능력 사용 직후에 현재 이을 음절로 끝나는 3글자 이하의 단어만 사용할 수 있습니다.\n" +
                "또한, 환자는 능력 사용 후 2턴간 한방단어와 유도단어를 사용할 수 없습니다.\n" +
                "이 능력은 루트단어를 받았을 때만 사용 가능합니다.\n7턴부터 사용 가능합니다."
            );
            if (state.patient_no_kill_turns > 0) debuff.push("환각증 여파 : " + state.patient_no_kill_turns + "턴간 한방/유도 불가");

        } else if (state.job === "수집가") {
            abilities.push(
                "< 수집 > - 패시브(자동 시전 능력)\n" +
                "상대방이 사용한 단어의 첫 번째 음절을 수집하여 저장합니다.\n" +
                "{ 제작 } 능력으로 만들어진 단어는 한방단어, 유도단어, 루트단어, 일반단어 중 그 무엇도 아닌 '추가단어'로 취급되며, 누구든 사용할 수 있습니다.\n" +
                "수집가 직업이 추가단어를 사용하게 되면 상대방은 1턴간 패시브와 능력을 사용할 수 없습니다.\n" +
                "↳ 수집된 음절: [" + (state.collected_syllables.length > 0 ? state.collected_syllables.join(", ") : "없음") + "]"
            );
            abilities.push(
                "< 제작 > - 쿨타임 6턴" + (state.make_cooldown > 0 ? " | " + state.make_cooldown + "턴 남음" : "") + "\n" +
                "수집한 음절을 소모하여 2글자 이상의 추가단어를 생성합니다.\n" +
                "생성된 추가단어는 한 번 사용할 수 있습니다.\n명령어는 [2제작 (단어)] 형태로 사용합니다."
            );
            abilities.push(
                "< 채굴 > - 쿨타임 6턴 | " + (2 - state.mine_uses) + "회 남음" + (state.mine_cooldown > 0 ? " | " + state.mine_cooldown + "턴 남음" : "") + "\n" +
                "1턴간 { 수집 } 패시브 발동 시 상대방이 사용한 단어의 모든 음절을 수집합니다."
            );
            if (state.mine_active > 0) buff.push("채굴 활성화 중 (이번 차례 모든 음절 수집)");

        } else if (state.job === "감시자") {
            abilities.push(
                "< 감시 > - 패시브(자동 시전 능력) | 패시브 불가 무시\n" +
                "게임 시작 후 감시 수가 30으로 설정됩니다.\n" +
                "상대방이 유도단어 사용 시 감시 수 -4, 한방단어 사용 시 -8, 루트단어 사용 시 -2.\n" +
                "감시자에게 디버프가 존재하면 매턴 디버프 하나당 감시 수를 1 차감합니다.\n" +
                "감시 수가 0 이하가 되면 무기한으로 이을 음절에 상관없이 그 어떤 단어나 사용할 수 있습니다.\n" +
                "↳ 현재 감시 수: " + state.watch_count
            );
            abilities.push(
                "< 탐지 > - 쿨타임 6턴 | " + (2 - state.detect_uses) + "회 남음" + (state.detect_cooldown > 0 ? " | " + state.detect_cooldown + "턴 남음" : "") + "\n" +
                "상대방이 1턴간 능력을 사용하면 하나당 감시 수를 10 깎습니다.\n" +
                "또한, 다음 차례에 { 감시 } 패시브 발동 시 감시 수를 2배로 차감합니다."
            );
            if (state.detect_active_turns > 0) buff.push("탐지 활성화 중 (다음 감시 패시브 2배 차감)");

        } else if (state.job === "뜀틀선수") {
            abilities.push(
                "< 뜀틀 > - 패시브(자동 시전 능력) | 쿨타임 5턴 | " + (state.vault_max - state.vault_uses) + "회 남음" + (state.vault_cooldown > 0 ? " | " + state.vault_cooldown + "턴 남음" : "") + "\n" +
                "언제든지 '뜀틀' 단어를 사용할 수 있습니다.\n" +
                "사용 시 상대방은 1턴간 유도단어를 사용할 수 없으며 패시브와 능력을 사용할 수 없습니다."
            );
            abilities.push(
                "< 허들 넘기 > - " + (1 - state.hurdle_uses) + "회 남음\n" +
                "22턴 이상이 되면 사용 가능합니다.\n{ 뜀틀 } 패시브의 기회를 1회 추가하고 쿨타임을 초기화합니다."
            );

        } else if (state.job === "전우치") {
            abilities.push(
                "< 잔상 > - 패시브(자동 시전 능력) | " + (1 - state.afterimage_uses) + "회 남음\n" +
                "더 이상 이어나갈 수 있는 단어가 없을 때, 아무 루트단어로 이어갈 수 있습니다.\n" +
                "이미 사용한 단어에 의해 이어나갈 수 없는 경우엔 발동하지만, 디버프로 인해 이을 단어가 없거나\n시스템상으로 단어 구조가 변경되어 이을 단어가 없는 경우는 발동하지 않습니다.\n6턴부터 사용 가능합니다."
            );
            abilities.push(
                "< 직격뢰 > - 쿨타임 7턴 | " + (4 - state.lightning_uses) + "회 남음" + (state.lightning_cooldown > 0 ? " | " + state.lightning_cooldown + "턴 남음" : "") + "\n" +
                "특정 유도단어나 루트단어가 사라지게 하여 영구적으로 아무도 사용할 수 없도록 합니다.\n'2직격뢰 (단어)' 형식으로 사용합니다."
            );

        } else if (state.job === "기관사") {
            abilities.push(
                "< 운행 > - 패시브(자동 시전 능력)\n" +
                "3의 배수인 턴이 되면 전철역에 정차하여 1턴간 상대방이 패시브와 능력 및 유도단어를 사용할 수 없게 합니다.\n" +
                "전철역 수는 총 8개며, 상대방은 글자 수가 종점까지 남은 역 수보다 큰 단어를 사용할 수 없습니다.(최소 2글자)\n" +
                "종점에 도착하면 승리합니다.\n" +
                "단, 기관사 대 기관사 대전에서는 패시브 불가 효과를 주지 않으며, 종점 도착 시 무승부 처리됩니다.\n" +
                "↳ 남은 전철역 수: " + state.train_stations
            );

        } else if (state.job === "늑대인간") {
            abilities.push(
                "< 포효 > - 패시브(자동 시전 능력) | 쿨타임 2턴" + (state.roar_cooldown > 0 ? " | " + state.roar_cooldown + "턴 남음" : "") + "\n" +
                "사용한 단어에 [ㅇ] 또는 [ㅎ]이 포함된 개수에 따라 상대방에게 디버프를 부여합니다.\n" +
                "개수가 1개 이상이면 2턴간 짝수 글자의 단어만 사용 가능하게 합니다.\n" +
                "개수가 3개 이상이면 추가적으로 1턴간 능력을 사용할 수 없게 합니다."
            );

        } else if (state.job === "시프터") {
            abilities.push(
                "< 시프트 > - " + (3 - state.shift_uses) + "회 남음\n" +
                "현재 이을 음절의 중성을 다음 중성으로 넘깁니다.\n" +
                "넘긴 직후 두음법칙은 적용되지 않으며, 중성의 순서는 [ᅡᅢᅣᅤᅥᅦᅧᅨᅩᅪᅫᅬᅭᅮᅯᅰᅱᅲᅳᅴᅵ]입니다.\n" +
                "단, 현재 이을 음절로 시작하는 단어가 없으면 이 능력을 사용할 수 없습니다."
            );

        } else if (state.job === "비밀요원") {
            abilities.push(
                "< 타깃 확보 > - 패시브(자동 시전 능력)\n" +
                "단어를 입력하면 입력한 단어로부터 이어질 수 있는 단어를 최대 3개까지 타깃 단어로 설정합니다.\n" +
                "4글자 이하의 유도단어와 루트단어 중 긴 단어가 우선 선정되며, 길이가 같은 단어의 경우 ㄱㄴㄷ순으로 선정됩니다.\n" +
                "상대방이 타깃 단어를 사용하면 상대방은 1턴간 패시브와 능력을 사용할 수 없고,\n2턴간 타깃으로 설정되어 { 포획 } 능력의 대상이 되며, 5글자 이상의 단어를 사용할 수 없습니다.\n" +
                "이 패시브가 다시 발동할 때까지 타깃 단어는 변동되지 않습니다.\n" +
                "↳ 현재 타깃 수: " + state.targets.length + (state.targets.length > 0 ? " [" + state.targets.join(", ") + "]" : "")
            );
            abilities.push(
                "< 포획 > - 쿨타임 3턴 | " + (2 - state.capture_uses) + "회 남음" + (state.capture_cooldown > 0 ? " | " + state.capture_cooldown + "턴 남음" : "") + "\n" +
                "상대방이 타깃으로 설정되었을 때만 사용 가능합니다.\n" +
                "지정한 음절로 시작하는 사용 가능한 유도단어와 루트단어 4개를 사라지게 하여 영구적으로 아무도 사용하지 못하게 합니다.\n" +
                "또한, 상대방이 2턴간 패시브와 능력을 사용할 수 없게 합니다.\n" +
                "이 능력은 능력 사용 불가 효과를 무시합니다. [2포획 (음절)]"
            );

        } else if (state.job === "67") {
            abilities.push(
                "< 67 > - 패시브(자동 시전 능력) | " + (state.sixtyseven_cooldown > 0 ? state.sixtyseven_cooldown + "턴 남음" : "0턴 남음") + "\n" +
                "6글자 단어를 사용하면 상대방은 7턴간 유도단어를 사용할 수 없습니다.\n" +
                "이미 유도 불가 효과가 있다면 7턴 증가시키며, 없다면 1턴간 한방단어를 사용할 수 없게 합니다.\n" +
                "상대방의 유도 불가 효과의 턴 수가 67턴 이상이 된다면 게임에서 즉시 승리합니다.\n" +
                "패시브 불가 효과를 무시합니다."
            );

        } else if (state.job === "사과") {
            abilities.push(
                "< 삭와 > - 패시브(자동 시전 능력) | 쿨타임 2턴" + (state.apple_passive_cooldown > 0 ? " | " + state.apple_passive_cooldown + "턴 남음" : "") + "\n" +
                "입력한 단어의 초성이나 종성에 포함된 [ㅅㄱㄴㅁㅇ]의 개수가 2개 이상이면 3턴간 상대방에게 사과 디버프를 부여합니다.\n" +
                "이미 사과 디버프가 있으면 2턴 연장합니다.\n" +
                "사과 디버프는 3글자 이상의 한방단어와 5글자 이상의 유도단어를 사용하지 못하도록 합니다.\n" +
                "이 패시브가 1회 이상 사용되지 않은 채로 10턴 이상이 되었을 때 이 패시브가 발동하면 게임에서 즉시 승리합니다.\n" +
                "↳ 미사용 연속: " + state.apple_unused_turns + "턴 / 쿨: " + state.apple_passive_cooldown + "턴"
            );
            abilities.push(
                "< 사구아 > - " + (1 - state.sagua_uses) + "회 남음\n" +
                "상대방이 3턴간 패시브와 능력을 사용하지 못하게 합니다."
            );

        } else if (state.job === "시인") {
            abilities.push(
                "< 2음절 > - 쿨타임 2턴 | " + (3 - state.poetic_2_uses) + "회 남음" + (state.poetic_2_cooldown > 0 ? " | " + state.poetic_2_cooldown + "턴 남음" : "") + "\n" +
                "상대방이 1턴간 두 글자 단어만 사용할 수 있게 합니다."
            );
            abilities.push(
                "< 시적 허용 > - 쿨타임 3턴 | " + (2 - state.poetic_allow_uses) + "회 남음" + (state.poetic_allow_cooldown > 0 ? " | " + state.poetic_allow_cooldown + "턴 남음" : "") + "\n" +
                "상대방이 1턴간 두음법칙을 사용할 수 없게 합니다."
            );

        } else if (state.job === "공룡") {
            abilities.push(
                "< 삼키기 > - 쿨타임 7턴 | " + (2 - state.swallow_uses) + "회 남음" + (state.swallow_cooldown > 0 ? " | " + state.swallow_cooldown + "턴 남음" : "") + "\n" +
                "마지막으로 사용된 단어를 삼키고, 그 이전 단어를 기준으로 단어를 잇습니다.\n" +
                "삼킨 직후엔 글자 수가 3글자 이하인 단어만 사용할 수 있고, 유도단어와 한방단어를 사용할 수 없으며, 두음법칙 또한 사용할 수 없습니다."
            );
            abilities.push(
                "< 브레스 > - " + (1 - state.breath_uses) + "회 남음\n" +
                "상대방이 1턴간 유도단어를 사용할 수 없도록 합니다.\n10턴부터 사용 가능합니다."
            );
            abilities.push(
                "< 꼬리 날리기 > - " + (1 - state.tail_uses) + "회 남음\n" +
                "다음 차례에 능력 사용 불가 디버프를 무시합니다.\n13턴부터 사용할 수 있습니다."
            );
            if (state.tail_active) buff.push("꼬리 날리기 발동됨 (이번 차례 능력 불가 무시)");

        } else if (state.job === "마법사") {
            abilities.push(
                "< 부작용 > - 패시브(자동 시전 능력)\n" +
                "마법사는 14턴까지 한방단어와 유도단어를 사용할 수 없습니다." +
                (game.turnCount <= 14 ? " (현재 적용 중)" : " (해제됨)")
            );
            abilities.push(
                "< 공허 > - 쿨타임 4턴 | " + (5 - state.void_uses) + "회 남음" + (state.void_cooldown > 0 ? " | " + state.void_cooldown + "턴 남음" : "") + "\n" +
                "현재 이을 음절의 종성을 제거합니다.\n제거 후 두음법칙을 사용할 수 있습니다."
            );
            abilities.push(
                "< 폭발 > - " + (1 - state.explosion_uses) + "회 남음\n" +
                "현재 가진 모든 디버프를 제거합니다.\n14턴부터 사용 가능합니다."
            );

        } else if (state.job === "사신") {
            abilities.push(
                "< 처형 > - 패시브(자동 시전 능력) | 4444회용\n" +
                "게임 시작 후 처형 수가 44로 설정됩니다.\n" +
                "사신이 입력하는 단어의 글자 수만큼 처형 수가 차감되며,\n8글자 이상의 단어를 입력하면 처형식을 개최하여 상대방은 1턴간 패시브와 능력, 그리고 한방단어와 유도단어를 사용할 수 없습니다.\n" +
                "↳ 남은 처형 수: " + state.execution_count
            );
            abilities.push(
                "< 사형 선고 > - 쿨타임 4턴" + (state.death_cooldown > 0 ? " | " + state.death_cooldown + "턴 남음" : "") + "\n" +
                "능력 사용 직후 처형 수가 18 이하면 상대방은 1턴간 글자 수가 4글자 이하인 단어를 사용할 수 없습니다.\n처형 수가 4 이하면 게임에서 즉시 승리합니다."
            );

        } else if (state.job === "수학자") {
            abilities.push(
                "< 계산 > - 쿨타임 1턴 | " + (2 - state.calc_uses) + "회 남음" + (state.calc_cooldown > 0 ? " | " + state.calc_cooldown + "턴 남음" : "") + "\n" +
                "능력 사용 시 결과 수가 20이면 게임에서 승리합니다.\n" +
                "결과 수는 게임 시작 후 바로 0으로 설정되며, 변동되어도 결과 수 자체를 알려 주지 않으므로 직접 계산하여야 합니다.\n해당 능력 사용 시 결과 수가 공개됩니다."
            );
            abilities.push(
                "< 덧셈 > - 쿨타임 2턴 | " + (3 - state.add_uses) + "회 남음" + (state.add_cooldown > 0 ? " | " + state.add_cooldown + "턴 남음" : "") + "\n" +
                "능력 사용 직전에 받은 단어의 글자 수만큼을 결과 수에 더합니다."
            );
            abilities.push(
                "< 뺄셈 > - " + (2 - state.sub_uses) + "회 남음\n" +
                "능력 사용 직전에 받은 단어의 글자 수만큼을 결과 수에서 뺍니다."
            );
            abilities.push(
                "< 곱셈 > - " + (1 - state.mul_uses) + "회 남음\n" +
                "능력 사용 직전에 받은 단어의 글자 수만큼을 결과 수에 곱합니다."
            );
            abilities.push(
                "< 교정 > - 쿨타임 4턴 | " + (2 - state.correct_uses) + "회 남음" + (state.correct_cooldown > 0 ? " | " + state.correct_cooldown + "턴 남음" : "") + "\n" +
                "결과 수에 1을 더합니다.\n이 능력 사용 후 다른 능력을 연달아 사용할 수 없습니다."
            );
            abilities.push(
                "< 미적분 > - " + (1 - state.calculus_uses) + "회 남음\n" +
                "상대방이 1턴간 패시브와 능력을 사용할 수 없게 합니다."
            );

        } else if (state.job === "과학자") {
            abilities.push(
                "< 실험 > - 패시브(자동 시전 능력) | 쿨타임 1턴 | 패시브 불가 무시" + (state.experiment_cooldown > 0 ? " | " + state.experiment_cooldown + "턴 남음" : "") + "\n" +
                "초성이나 종성에 [ㅇㅅㅎ]이 총 4개 이상 포함된 단어를 사용하면 실험에 성공합니다.\n" +
                "성공 시 상대방은 1턴간 한방단어와 유도단어, 능력, 패시브를 사용할 수 없습니다.\n" +
                "↳ 누적 성공 횟수: " + state.experiment_success_total
            );
            abilities.push(
                "< DNA파괴 > - 쿨타임 8턴 | " + (2 - state.dna_uses) + "회 남음" + (state.dna_cooldown > 0 ? " | " + state.dna_cooldown + "턴 남음" : "") + "\n" +
                "상대의 액티브 능력 하나를 지정하고, 다음 턴부터 실험 2연속 성공 시 그 능력을 파괴합니다." +
                (state.dna_tracking && state.dna_target ? "\n↳ 현재 표적: " + state.dna_target + " | 연속 성공: " + state.dna_success_streak + " / 2" : "")
            );
            abilities.push(
                "< 도전 > - " + (1 - state.challenge_uses) + "회 남음\n" +
                "실험 15회 이상 성공 후 사용 가능하며, 이후에는 사전에 없는 단어도 영구적으로 사용할 수 있습니다." +
                (state.challenge_active ? "\n↳ 세계적인 과학자 상태 활성화" : "")
            );

        } else if (state.job === "갈릴레오") {
            let moons = getGalileoMoonList(state);
            abilities.push(
                "< 관측 > - 패시브(자동 시전 능력)\n" +
                "사용한 단어의 초성과 종성을 분석해 목성의 위성을 발견합니다.\n" +
                "이오, 유로파, 가니메데, 칼리스토를 모두 발견하면 즉시 승리합니다.\n" +
                "위성을 발견하면 상대는 3턴 동안 끝음절이 루트음절인 단어만 사용할 수 있습니다.\n" +
                "↳ 발견한 위성: [" + (moons.length > 0 ? moons.join(", ") : "없음") + "]"
            );
            abilities.push(
                "< 관성의 법칙 > - 패시브(자동 시전 능력)\n" +
                "상대는 끝음절 초성이 ㄲ, ㄸ, ㅃ, ㅆ, ㅉ인 단어를 사용할 수 없습니다."
            );

        } else if (state.job === "작곡가") {
            let noteLabels = [];
            for (let i = 0; i < state.compose_notes.length; i++) {
                noteLabels.push(state.compose_notes[i] + "분음표");
            }
            abilities.push(
                "< 작곡 > - 패시브(자동 시전 능력) | 패시브 불가 무시\n" +
                "상대가 사용한 단어 길이가 2, 4, 8이면 각각 2분음표, 4분음표, 8분음표를 악보에 추가합니다.\n" +
                "마디가 완성되면 8분음표 포함 시 즉시 승리하고, 4분음표 개수만큼 상대의 유도단어를 봉쇄합니다.\n" +
                "↳ 현재 악보: [" + (noteLabels.length > 0 ? noteLabels.join(", ") : "없음") + "]\n" +
                "↳ 현재 박자: " + composerUnitsToBeatText(state.compose_units) + " / " + composerUnitsToBeatText(state.compose_target_units)
            );
            abilities.push(
                "< 쪼개기 > - " + (3 - state.split_uses) + "회 남음\n" +
                "다음 작곡 패시브 발동 때 2분음표는 4분음표로, 4분음표는 8분음표로 쪼개집니다." +
                (state.split_pending ? "\n↳ 현재 쪼개기 대기 중" : "")
            );
            abilities.push(
                "< 쉼표 > - 쿨타임 3턴" + (state.rest_cooldown > 0 ? " | " + state.rest_cooldown + "턴 남음" : "") + "\n" +
                "현재 마디를 쉼표로 즉시 완성하지만 작곡 패시브 효과는 발동하지 않습니다.\n" +
                "상대는 1턴 동안 한방단어를 사용할 수 없습니다."
            );
            if (state.split_pending) buff.push("쪼개기 대기 중 (다음 음표 한 단계 세분화)");

        } else if (state.job === "스폰지밥") {
            let burgerPrice = getSpongebobFoodPrice(state, "게살버거");
            let friesPrice = getSpongebobFoodPrice(state, "감자튀김");
            abilities.push(
                "< 저금통 > - 패시브(자동 시전 능력)\n" +
                "게임 시작 시 4000원을 가지고 시작합니다.\n" +
                "상대방이 단어를 말할 때마다 글자 수 x 1000원만큼 저금합니다.\n" +
                "↳ 현재 보유 금액: " + state.money + "원"
            );
            abilities.push(
                "< 게살버거 > - 쿨타임 1턴" + (state.burger_cooldown > 0 ? " | " + state.burger_cooldown + "턴 남음" : "") + "\n" +
                "현재 가격은 " + burgerPrice + "원입니다.\n" +
                "상대방은 1턴간 한방단어와 유도단어를 사용할 수 없습니다."
            );
            abilities.push(
                "< 감자튀김 > - 쿨타임 1턴" + (state.fries_cooldown > 0 ? " | " + state.fries_cooldown + "턴 남음" : "") + "\n" +
                "현재 가격은 " + friesPrice + "원입니다.\n" +
                "상대방은 2턴간 짝수 글자 단어만 사용할 수 있습니다."
            );
            abilities.push(
                "< 보너스 > - 쿨타임 3턴 | " + (4 - state.bonus_uses) + "회 남음" + (state.bonus_cooldown > 0 ? " | " + state.bonus_cooldown + "턴 남음" : "") + "\n" +
                "다음에 들어오는 돈이 2배가 됩니다." +
                (state.bonus_active ? "\n↳ 현재 보너스 대기 중" : "")
            );
            abilities.push(
                "< 강도 채용 > - 쿨타임 5턴 | " + (3 - state.robber_uses) + "회 남음" + (state.robber_cooldown > 0 ? " | " + state.robber_cooldown + "턴 남음" : "") + "\n" +
                "가격은 30000원입니다.\n" +
                "다음부터 2턴 동안 5000원씩 추가 수익이 들어옵니다.\n" +
                "현상수배 중에는 게살버거/감자튀김 가격이 3000원 상승하고 5글자 이상 단어를 사용할 수 없습니다."
            );
            if (state.bonus_active) buff.push("보너스 대기 중 (다음 수익 2배)");
            if (isSpongebobWanted(state)) debuff.push("현상수배 : 5글자 이상 단어 불가 / 음식 가격 +3000");

        } else if (state.job === "나이트") {
            abilities.push(
                "< L자 도약 > - 패시브(자동 시전 능력)\n" +
                "사용 단어 길이가 [2, 4, 2] 순서를 이루면 상대를 봉쇄합니다.\n" +
                "↳ 현재 기록: [" + (state.knight_pattern && state.knight_pattern.length > 0 ? state.knight_pattern.join("-") : "없음") + "]"
            );
            abilities.push(
                "< 체크메이트 > - 쿨타임 4턴 | " + (5 - state.checkmate_uses) + "회 남음" + (state.checkmate_cooldown > 0 ? " | " + state.checkmate_cooldown + "턴 남음" : "") + "\n" +
                "상대는 1턴 동안 두음법칙을 사용할 수 없고 2턴 동안 루트단어만 사용할 수 있습니다."
            );
            abilities.push(
                "< 교환 > - " + (1 - state.exchange_uses) + "회 남음\n" +
                "상대 턴이 지나면 다음 차례에 아무 루트단어를 중복과 무관하게 사용할 수 있습니다."
            );
            abilities.push(
                "< 울음 > - " + (1 - state.cry_uses) + "회 남음\n" +
                "말이 울음소리를 냅니다.\n" +
                "기능은 없습니다."
            );
            if (state.exchange_pending) buff.push("교환 대기 중 (상대 턴 후 다음 차례 발동)");
            if (state.exchange_active) buff.push("교환 활성화 (이번 차례 아무 루트단어 / 중복 무시)");

        } else if (state.job === "생존자") {
            abilities.push(
                "< 신호 > - 패시브(자동 시전 능력) | 쿨타임 1턴\n" +
                "2글자 단어를 입력하면 [ · ] 모스부호 신호를 보냅니다.\n" +
                "3글자 이상의 단어를 입력하면 [ - ] 모스부호 신호를 보냅니다.\n" +
                "전체 모스부호 신호가 [ · · · - - - · · · - · - · - - ]가 되면 'SOS!' 신호가 완성되어 게임에서 즉시 승리합니다.\n" +
                "신호를 잘못 입력하면 그 신호는 취소되지만, 상대방이 1턴간 3글자 이상의 유도단어를 사용할 수 없도록 합니다.\n" +
                "↳ 현재 모스부호: [" + (state.signal_sequence || "없음") + "]"
            );
            abilities.push(
                "< 긴급 구조 > - 쿨타임 7턴 | " + (2 - state.rescue_uses) + "회 남음" + (state.rescue_cooldown > 0 ? " | " + state.rescue_cooldown + "턴 남음" : "") + "\n" +
                "게임에서 사용된 단어 중 맨처음 2개의 단어를 제외한 전체 단어를 한 묶음으로 하여 뒤집고, 뒤집은 단어를 기준으로 게임을 진행합니다.\n" +
                "[기차 차표 표범 범죄 죄인]이면 [인죄 죄범 범표]와 같이 뒤집힙니다.\n" +
                "긴급 구조 발동 시 모든 디버프를 제거하지만, 1턴간 한방단어나 유도단어를 사용할 수 없습니다.\n한방단어나 유도단어를 받았을 때만 사용 가능합니다."
            );

        } else if (state.job === "악당") {
            abilities.push(
                "< 결계 > - 쿨타임 5턴 | " + (4 - state.barrier_uses) + "회 남음" + (state.barrier_cooldown > 0 ? " | " + state.barrier_cooldown + "턴 남음" : "") + "\n" +
                "능력 사용 시 마지막에 사용된 단어의 글자 수만큼의 턴간 지속되는 결계를 생성합니다.\n" +
                "결계가 생성되면 결계 초성이 [ㄱㄴ]으로 설정되며, 상대방은 결계가 지속되는 동안 끝음절에 결계 초성이 포함된 단어를 사용할 수 없습니다.\n" +
                "또한, 결계가 지속되는 동안 상대방이 입력하는 단어의 글자 수만큼 결계 초성이 늘어납니다.\n" +
                "추가되는 순서는 [ㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ]입니다.\n" +
                "결계 초성이 [ㅎ]까지 도달하면 결계가 끝날 때까지 더 이상 변동되지 않습니다." +
                (state.barrier_turns > 0 ? "\n↳ 결계 전개 중 (" + state.barrier_turns + "턴 남음) : [" + state.barrier_chosungs.join(", ") + "]" : "")
            );
            abilities.push(
                "< 왜곡 > - 쿨타임 1턴 | " + (2 - state.distort_uses) + "회 남음" + (state.distort_cooldown > 0 ? " | " + state.distort_cooldown + "턴 남음" : "") + "\n" +
                "결계 시전 중에만 사용할 수 있습니다.\n" +
                "사용 즉시 1턴간 이때까지 진행된 결계 초성을 모두 왜곡합니다.\n" +
                "[ㄱㄴㄷㄹ]인 경우, [ㅎㅍㅌㅋ]로 왜곡됩니다.\n" +
                "왜곡된 결계 초성이 4개 이상인 경우 상대방은 1턴간 능력을 사용할 수 없습니다."
            );
            if (state.barrier_turns > 0) buff.push("결계 전개 중 (" + state.barrier_turns + "턴 남음) : [" + state.barrier_chosungs.join(", ") + "]");

        } else if (state.job === "기자") {
            abilities.push(
                "< 거짓 보도 > - 쿨타임 3턴 | " + (4 - state.report_uses) + "회 남음" + (state.report_cooldown > 0 ? " | " + state.report_cooldown + "턴 남음" : "") + "\n" +
                "1턴간 보도를 실시하며, 상대방이 보도 중에 한방단어나 유도단어를 사용하면 마지막 음절을 '삐'로 변경 후\n상대방이 1턴간 능력과 유도단어를 사용하지 못하도록 합니다.\n" +
                "상대방은 보도 중엔 패시브와 능력을 사용할 수 없으며, 두음법칙도 제한됩니다." +
                (state.report_turns > 0 ? "\n↳ 보도 중 (" + state.report_turns + "턴 남음)" : "")
            );
            if (state.report_turns > 0) buff.push("보도 중 (상대 패시브/능력/두음법칙 불가, " + state.report_turns + "턴 남음)");

        } else if (state.job === "검객") {
            abilities.push(
                "< 찌르기 > - 쿨타임 5턴 | " + (2 - state.stab_uses) + "회 남음" + (state.stab_cooldown > 0 ? " | " + state.stab_cooldown + "턴 남음" : "") + "\n" +
                "상대방이 1턴간 패시브와 능력을 사용할 수 없게 합니다.\n" +
                "또한, 1턴간 두음법칙을 사용할 수 없도록 합니다.\n5턴부터 사용 가능합니다."
            );
            abilities.push(
                "< 가르기 > - 쿨타임 3턴 | " + (3 - state.slice_uses) + "회 남음" + (state.slice_cooldown > 0 ? " | " + state.slice_cooldown + "턴 남음" : "") + "\n" +
                "능력 사용 직전에 받은 단어를 반으로 가르고 단어를 이어갑니다.\n" +
                "홀수 단어를 가르면 초성과 종성, 종성이 없으면 초성과 중성 기준으로 갈라집니다.(속 -> 소/ㄱ, 누 -> ㄴ/ㅜ)\n" +
                "가른 직후 두음법칙은 적용되지 않으며, 현재 턴이 12턴 이상이 아니라면 가른 직후 한방단어와 유도단어를 사용할 수 없습니다."
            );

        } else if (state.job === "마하트마간디") {
            abilities.push(
                "< 비폭력 > - 패시브(자동 시전 능력) | 쿨타임 1턴 | 패시브 불가 무시\n" +
                "상대방이 한방단어나 유도단어를 사용할 때마다 비폭력 스탯이 1회 추가됩니다.\n" +
                "상대방이 능력을 사용하고 차례가 지나면 비폭력 스탯이 1회 추가됩니다.\n" +
                "비폭력 스탯이 3회가 되면 개발자를 협박하여 게임을 즉시 승리로 종료합니다.\n" +
                "↳ 현재 비폭력 스탯: " + state.gandhi_stacks
            );
            abilities.push(
                "< 억제 > - 쿨타임 3턴" + (state.suppress_cooldown > 0 ? " | " + state.suppress_cooldown + "턴 남음" : "") + "\n" +
                "비폭력 스탯을 1회 사용하여 상대방이 1턴간 유도단어를 사용할 수 없게 합니다."
            );

        } else if (state.job === "은하계전사") {
            abilities.push(
                "< 별인 듯 달 아닌 별 > - 패시브(자동 시전 능력) | 쿨타임 1턴" + (state.star_cooldown > 0 ? " | " + state.star_cooldown + "턴 남음" : "") + "\n" +
                "[별] 또는 [달]이 포함된 단어를 사용하면 상대방은 2턴간 끝음절이 루트음절인 단어만 사용 가능하고, 패시브와 능력을 사용할 수 없습니다.\n" +
                "[별] 또는 [달]이 포함된 단어를 3번 이상 사용할 경우, 끝음절이 [벨]으로 변경됩니다.\n" +
                "16턴 이전에 [벨]을 한 번이라도 주게 되면 16턴 이상이 되었을 때 단 한 번,\n사용하는 단어의 끝음절이 [볠]으로 변하게 되며,\n상대방은 무기한으로 끝음절 초성이 [ㅅㅍㄴㅂ] 중 하나인 단어만 사용 가능합니다.(이때, 더 이상 이 패시브는 발동하지 않습니다.)\n" +
                "↳ 별달 스택: " + state.star_stacks
            );

        } else if (state.job === "혜성전사") {
            abilities.push(
                "< 핼리 혜성 > - 패시브(자동 시전 능력)" + (state.comet_passive_cooldown > 0 ? " | " + state.comet_passive_cooldown + "턴 남음" : "") + "\n" +
                "[성]이 포함된 단어를 사용하면 결계가 생성되거나 지속 시간이 1턴 늘어나며 상대는 1턴간 유도단어를 사용할 수 없습니다.\n" +
                "결계가 생성되면 3턴 동안 지속되고 결계 초성은 [ㄱ, ㄴ]에서 시작합니다.\n" +
                "결계가 유지되는 동안 상대는 끝음절 초성이 결계 초성에 포함된 단어와 유도단어를 사용할 수 없습니다.\n" +
                "[혜]가 포함된 단어를 사용하면 결계가 즉시 종료되고 상대는 2턴간 유도단어를 사용할 수 없습니다.\n" +
                "16턴 전까지 [성] 5회 이상, [혜] 1회 이상이면 상대는 영구적으로 끝음절 초성 [ㅎ, ㅅ]만 사용할 수 있습니다."
            );
            if (state.comet_barrier_turns > 0) buff.push("혜성 결계 전개 중 (" + state.comet_barrier_turns + "턴 남음) : [" + state.comet_barrier_chosungs.join(", ") + "]");

        } else if (state.job === "수리사") {
            abilities.push(
                "< 방탄 > - 패시브(자동 시전 능력) | 쿨타임 1턴" + (state.bulletproof_cooldown > 0 ? " | " + state.bulletproof_cooldown + "턴 남음" : "") + " | 6회용\n" +
                "단어 입력 시 상대방은 1턴간 끝음절로 시작하는 단어가 10개 이하인 단어를 사용할 수 없습니다."
            );
            abilities.push(
                "< 수리 > - 쿨타임 6턴 | " + (4 - state.repair_uses) + "회 남음" + (state.repair_cooldown > 0 ? " | " + state.repair_cooldown + "턴 남음" : "") + "\n" +
                "현재 이을 음절의 중성을 애매하게 수리합니다.\n" +
                "수리 후 두음법칙을 사용할 수 있지만, 유도단어는 사용할 수 없습니다.\n" +
                "[ㅏㅑㅓㅕㅣ] <-> [ㅜㅠㅗㅛㅡ]"
            );
        } else if (state.job === "고죠") {
            abilities.push(
                "< 무하한 > - 패시브(자동 시전 능력)\n" +
                "게임 시작 후 상대방은 무기한으로 되돌림단어를 사용할 수 없습니다."
            );
            abilities.push(
                "< 무량공처 > - 쿨타임 2턴 | " + (6 - state.gongcheo_uses) + "회 남음" + (state.gongcheo_cooldown > 0 ? " | " + state.gongcheo_cooldown + "턴 남음" : "") + "\n" +
                "상대방은 1턴간 공격단어 불가 및 패시브/능력 '절대' 사용 불가 상태가 됩니다."
            );
        } else if (state.job === "우라늄") {
            abilities.push(
                "< 방사선 > - 패시브(자동 시전 능력) | 쿨타임 1턴" + (state.radiation_cooldown > 0 ? " | " + state.radiation_cooldown + "턴 남음" : "") + "\n" +
                "3글자 단어를 사용하면 알파선.\n" +
                "2글자 단어를 3번 연속 사용하면 3번째에 베타선.\n" +
                "2글자, 3글자, 4글자, 5글자, 6글자를 순서대로 연속 사용하면 감마선이 발동합니다."
            );
            abilities.push(
                "< 핵분열 > - " + (1 - state.fission_uses) + "회 남음\n" +
                "상대의 마지막 단어에서 첫음절이 아닌 아무 음절로도 이어갈 수 있습니다.\n" +
                "단, 사용 직후 단어는 한방단어와 유도단어를 사용할 수 없습니다."
            );
            if (state.fission_active) buff.push("핵분열 활성화 : [" + state.fission_syllables.join(", ") + "] 음절로도 이어갈 수 있음");
        }

        // --- 공통 디버프 ---
        if (state.absolutely_disabled > 0) debuff.push("영역 전개 (절대 봉쇄) : " + state.absolutely_disabled + "턴 (능력/패시브 절대 사용 불가)");
        if (state.disabled_turns > 0) debuff.push("능력/패시브 상실 : " + state.disabled_turns + "턴");
        if (state.lost_abilities) debuff.push("능력 영구 상실");
        if (state.no_yudo_turns > 0) debuff.push("유도단어 불가 : " + state.no_yudo_turns + "턴");
        if (state.no_hanbang_turns > 0) debuff.push("한방단어 불가 : " + state.no_hanbang_turns + "턴");
        if (state.no_du_eum_turns > 0) debuff.push("두음법칙 불가 : " + state.no_du_eum_turns + "턴");
        if (state.only_even_turns > 0) debuff.push("짝수 글자 단어만 허용 : " + state.only_even_turns + "턴");
        if (state.only_length_2_turns > 0) debuff.push("2글자 단어만 허용 : " + state.only_length_2_turns + "턴");
        if (state.no_length_2_turns > 0) debuff.push("2글자 단어 사용 불가 : " + state.no_length_2_turns + "턴");
        if (state.only_root_turns > 0) debuff.push("루트단어만 허용 : " + state.only_root_turns + "턴");
        if (state.last_route_only_turns > 0) debuff.push("끝음절이 루트음절인 단어만 허용 : " + state.last_route_only_turns + "턴");
        if (state.only_length_2_forever) debuff.push("감마선 피폭 : 영구적으로 2글자 단어만 허용");
        if (state.no_all_batchim_turns > 0) debuff.push("모든 음절에 받침이 있는 단어 불가 : " + state.no_all_batchim_turns + "턴");
        if (state.limited_length > 0) debuff.push(state.limited_length + "글자 이하 단어만 허용");
        if (state.min_length > 0) debuff.push(state.min_length + "글자 이상 단어만 허용 (사신 사형 선고)");
        if (state.no_long_yudo_turns > 0) debuff.push("3글자 이상 유도단어 불가 : " + state.no_long_yudo_turns + "턴 (생존자 오신호)");
        if (state.target_active_turns > 0) debuff.push("비밀요원 타깃 포착 중 (" + state.target_active_turns + "턴 남음, 5글자 이상 금지)");
        if (state.apple_debuff_turns > 0) debuff.push("사과 디버프 : " + state.apple_debuff_turns + "턴 (3글자 이상 한방단어 & 5글자 이상 유도단어 불가)");
        if (state.comet_final_lock) debuff.push("혜성 잔광 : 영구적으로 끝음절 초성 [ㅎ, ㅅ]만 허용");
        if (state.destroyed_active_abilities && state.destroyed_active_abilities.length > 0) debuff.push("파괴된 능력 : [" + state.destroyed_active_abilities.join(", ") + "]");
        if (otherState && otherState.job === "해커" && otherState.chotohwa_active > 0) {
            debuff.push("초토화 위협 : 유도단어 또는 4글자 이상 사용 시 능력 영구 상실");
        }

        // [ 기타 ] - 직업별 수치 트래커
        if (state.job === "투자자") {
            etc.push("현재 주가 : " + state.investor_stock + " (목표: " + (game ? game.turnCount : "?") + " 이하)");
        }
        if (state.job === "수집가") {
            etc.push("보유 음절 : [" + (state.collected_syllables.length > 0 ? state.collected_syllables.join(", ") : "없음") + "]");
            if (game && game.customWords && game.customWords.size > 0) {
                etc.push("제작 단어 : [" + Array.from(game.customWords).join(", ") + "]");
            }
        }
        if (state.job === "감시자") {
            etc.push("현재 감시 수 : " + state.watch_count + " / 30");
        }
        if (state.job === "뜀틀선수") {
            etc.push("뜀틀 사용 : " + state.vault_uses + " / " + state.vault_max + "회");
        }
        if (state.job === "기관사") {
            etc.push("남은 역 수 : " + state.train_stations + " / 8");
        }
        if (state.job === "67") {
            etc.push("상대 유도 불가 누적 : " + (otherState ? otherState.no_yudo_turns : 0) + " / 67");
        }
        if (state.job === "사과") {
            etc.push("삭와 미발동 턴 : " + state.apple_unused_turns + " / 10턴 (10턴 미발동 시 승리)");
        }
        if (state.job === "마하트마간디") {
            etc.push("비폭력 스택 : " + state.gandhi_stacks + " / 3");
        }
        if (state.job === "은하계전사") {
            etc.push("별/달 스택 : " + state.star_stacks + "회" + (state.star_permanent_done ? " | [벨] 고정 완료" : "") + (state.star_ult_used ? " | [볠] 궁극 사용" : ""));
        }
        if (state.job === "혜성전사") {
            etc.push("[성] 사용 횟수 : " + state.comet_seong_count + " / 5회");
            etc.push("[혜] 사용 횟수 : " + state.comet_hye_count + " / 1회" + (state.comet_final_applied ? " | 영구 제한 발동 완료" : ""));
        }
        if (state.job === "사신") {
            etc.push("처형 수 : " + state.execution_count + " (4 이하 시 사형 선고로 즉시 승리)");
        }
        if (state.job === "수학자") {
            etc.push("수식 결과 : " + state.math_result + " (20 도달 시 계산 능력으로 승리)");
        }
        if (state.job === "과학자") {
            etc.push("실험 성공 누적 : " + state.experiment_success_total + "회");
            if (state.dna_tracking && state.dna_target) etc.push("DNA 표적 : " + state.dna_target + " | 연속 성공 " + state.dna_success_streak + " / 2");
            if (state.challenge_active) etc.push("세계적인 과학자 : 사전에 없는 단어도 사용 가능");
        }
        if (state.job === "갈릴레오") {
            let galileoMoons = getGalileoMoonList(state);
            etc.push("발견한 위성 : [" + (galileoMoons.length > 0 ? galileoMoons.join(", ") : "없음") + "]");
            etc.push("지동설 진행 : " + galileoMoons.length + " / 4");
        }
        if (state.job === "작곡가") {
            let composerNotes = [];
            for (let i = 0; i < state.compose_notes.length; i++) composerNotes.push(state.compose_notes[i] + "분음표");
            etc.push("현재 마디 : [" + (composerNotes.length > 0 ? composerNotes.join(", ") : "없음") + "]");
            etc.push("현재 박자 : " + composerUnitsToBeatText(state.compose_units) + " / " + composerUnitsToBeatText(state.compose_target_units));
            etc.push("쪼개기 사용 : " + state.split_uses + " / 3회");
        }
        if (state.job === "스폰지밥") {
            etc.push("보유 금액 : " + state.money + "원");
            etc.push("게살버거 가격 : " + getSpongebobFoodPrice(state, "게살버거") + "원");
            etc.push("감자튀김 가격 : " + getSpongebobFoodPrice(state, "감자튀김") + "원");
            if (isSpongebobWanted(state)) etc.push("강도 수익 남음 : " + state.robber_turns + "회");
        }
        if (state.job === "나이트") {
            etc.push("L자 기록 : [" + (state.knight_pattern && state.knight_pattern.length > 0 ? state.knight_pattern.join("-") : "없음") + "]");
            etc.push("울음 사용 : " + state.cry_uses + " / 1회");
        }
        if (state.job === "생존자") {
            let sigDisp = state.signal_sequence && state.signal_sequence.length > 0 ? state.signal_sequence : "없음";
            etc.push("SOS 신호 진행 : [" + sigDisp + "] (목표: · · · - - - · · · - · - · - -)");
        }
        if (state.job === "비밀요원") {
            etc.push("현재 타깃 : [" + (state.targets && state.targets.length > 0 ? state.targets.join(", ") : "없음") + "]");
        }
        if (state.job === "우라늄") {
            let gammaChain = state.uranium_gamma_chain && state.uranium_gamma_chain.length > 0 ? state.uranium_gamma_chain.join(", ") : "없음";
            etc.push("2글자 연속 횟수 : " + state.uranium_two_streak + " / 3");
            etc.push("감마 수열 진행 : [" + gammaChain + "]");
        }
        if (state.job === "수리사") {
            etc.push("방탄 사용 가능 : " + state.bulletproof_uses + " / 6회");
        }
        if (state.job === "고죠") {
            etc.push("무량공처 사용 가능 : " + state.gongcheo_uses + " / 6회");
        }


        let abilityBlock = abilities.join("\n\n\n");

        let buffBlock = buff.length > 0 ? buff.join("\n") : "";
        let debuffBlock = debuff.length > 0 ? debuff.join("\n") : "";

        return title + "\n" +
            abilityBlock + "\n\n\n" +
            "[ 버프 ]\n" + buffBlock + "\n\n" +
            "[ 디버프 ]\n" + debuffBlock + "\n\n" +
            "[ 기타 ]\n" + etc.join("\n");
    }

    let msg = "기보\n\n" + historyStr + "\n\n" +
        game.turnCount + "턴 | 채린룰 | 이을 음절 : " + nextChar + "\n" +
        "차례 : " + currentPlayer + " [" + curState.job + "]\n\n\n" +
        "< 서로의 상태 >\n\n" +
        makePlayerInfo(currentPlayer, curState, nxtState) + "\n\n\n\n" +
        makePlayerInfo(nextPlayer, nxtState, curState);

    return msg;
}

const NORMAL_SYL = "가각간갈감갑갓강개객갤갱갸거걱건걸검것겉게겔겨격겹경곁계고곡곤곧골곰곱곳공과관광괴교구국군굴굼굿궈귀그극근귿글금급긍긔기긴길김까깔깜깨꺼껍께꼬꼰꼴꼼꼽꽁꽃꾀꾸꿀꿰끄끈끌끝끼나낙낚난낟날남납낫낮낱내냅냉냐냠냥너넉넌널넝네넥넬녀녁년녈념녑녕노녹논놀놋농뇨뇽누눈눌뉘뉴뉵느늘능늦늪늬니닉닌닐님닙닛닝다닥단달닭담답당닻대댕댱더덕던덜덤덧덩데덴뎍뎐뎨도독돈돌돗동돛되됨됴두둘둥뒤듀듁드든들등디딕딜딥따딱딴딸땀땅때땜땡떡떼똥뚜뚝뚱뜨뜰뜸뜻뜽띠라락란랄람랍랏랑랒랓래램랩랫랭랴략량러레렉렌렙려력련렬렴렵렷령례롄로록론롤롯롱료룡루룬룰뤼류륙률르를릉릊릎리릭린릴림립릿링마막만맏말망매맥맨맴머먹먼멀멍메멘멜멧면명모목몫몬몰몸몽무묵문물뭇뮤믈미민믿밀밋바박반발밤밥밧방밭배백밴뱀뱃버벅번벋벌범법베벤벨벵벼별볏병보복본볼봄봉뵈부북분불붓뷰브블비빈빌빗빙빚빛빨빵뻘뻬뼈뽀뿌뿔사삯산살삼삽삿상새색샘샛생샤서석선설섬섯성세섹센셀셈셉셋셔션셩셰소속손솔솜솝솥쇠쇼수숙순술숨숫숭숯쉐쉬슈슐스슬승싁시신실심싱싸싹쌀쌈쌍쌔썩쎄쏠쐬쑹쒜쓰씨씰아악안알암압앗앙앞애액앵야약얌양얘어억언얼엄엇엉에엘엠엥여역연열염엽영예옌오옥온올옴옷옹옻와왁완왈왓왕왜외요용우운울움웃워원월웜웨웰위윈윗유육율윷으은을음응의이익인일임입잇잉자작잔잘잠잡잣장재잭잼쟁쟘쟝저적전절점접젓정젖제젠젤젹젼조족존졸좀종죄죡주줄중쥐쥔쥬즈즘증지진질짐집짓징짚짜짝짬쩡쪼쪽쭈쯔찌찐찔찜차착찬찰참창채책처천철첨청체첼초촌총최쵸추출춤충취측층치칙친칠칡침카칸칼캐캡커컨컷케켄켐코콕콘콜콤콧콩쿠쿤퀴퀸큐크큰클키킬킷킹타탁탄탈탐탑탕태탱터턱털텁텅테텔토톨톰통퇴투툴퉁튀튜트특틀틈티팀파판팔팜팡팥패팩팬팽퍼펀펄펑페펙펜펠펭편평폐포폭폰폴표푸푼풀품풋풍프플피픽핀필하학한할함합항해핵햄행향허헌헐헝헤헨헬혀혈협형혜호혹혼홀홈홉화환활황홰회횡후훈훠훤훼휘휴흐흑흙흠흥히힐힘";
const SEARCH_A_CLASS = "[갓갸걱것겔굿궈귿긔께꼰꼽꾀꿰끌낚낟낫냅냐냠냥넥넬녁녈녑놋뇽뉘뉵늪닌님닙닝댱덜덴뎍뎐뎨돛됨됴듀듁딕딥딱땀뚜뚱뜨뜽랄랏랒랓램랫렉렙렷롄롯룬룰뤼를릊릎릭릿맴멘멜멧몫몬뮤믈뱀벅뵈빨뻘뽀섹셀셉션셩셰솝솥숯슐싁쌈썩쎄쏠쐬쑹쒜씰앗얌얘엠엥옌옴옻왁왓웰윷잭잼쟘쟝젤젹젼죡쥔즘짚쩡쭈찐찔찜쵸춤칡캡컨컷켐콕콘쿤퀴퀸킬킷킹탱텁톰툴튜팀팜팡팩팬펄펙펠폰햄헨헬혀혹홈홉홰훠훤]";
const WIN_IN_1 = "가간갈강개갤거건게겨고곡곤골곰곳과관괴구귀그근귿글긔기길까꺼꼬꼼꽃끄끌나날남낱내네넬녀녈노논뇨누눈뉴니닉닌닐님닙닛다닥단달닭당대댱더던덜덩데덴도독돈돌동되두둘뒤듀듁드든들디딥땅때땡떼뜰라란랄람래램랴략러레려렬롄로론롤료루룬룰류리린릴립링마막말매머멀메멘멧모목몰몸무묵문물미민바반발밭배버베벨벼보볼부북불뷰브블비뼈뿌사산살삼삿새색샛생샤서설섬섯성세셀셰소속손솔쇠수술숨슈스슬시실심쌍쒜쓰씨아악안알암앞애앵야약어언얼엉에엘엠여열옌오옥온옷옹완왓외요우울웃원위윈윗유이인일입자잠장재잭저적정젖제젹젼조존좀주중쥬즈즘지진집짓쪽쭈찌차찰참채책천첼초추취층치친카칼캐커컨컷케코콕콜콤콩퀴크큰클키타탈태터털테텔토톰투툴튜트티팀파팔팜패팬퍼페펜포폴표푸풀풋풍프플피필하한할함해핵허헌헝헤헨헬혈호혼홀홉화황후흐히";
const WIN_IN_3 = "각감갓객갸걱걸검격겹경곁계광교국군굴굼굿금급김깔깜깨께꼴꼽꽁꾀꾸꿀꿰끈끝끼낙낚난납낫냅냉너넉넝녁년념녑녕놀놋농느늘능늪늬담답덤덧뎍돛됴둥등딜따딱딴딸땜떡똥뚝뜨뜸락랍랏랩랭량렉력련렴렵령례록롯롱률르를릉릎릭림릿만맏망맥맨먹멍멜몽뭇믈믿밀밋박밥밧방백뱃벅번벌범법벤별볏병복본봉뵈분빈빌빗빛빨삯삽상샘석선섹셉셋셩솜솝순숫숯쉐쉬승신싱싸쌈쌔쏠앙액얌양얘억엄엥역연염엽영예올옻왁왈왕왜운워월율윷은음응의익임잇작잔잡쟁전절점접젠젤졸종줄쥐질짐징쪼쯔찔찬창처철청체촌총쵸출춤충칠칸캡쿠쿤퀸큐킬킹탁탄탐탑탕턱텁톨통퇴튀판팡팥팽펄펙펠펭편평폐폭폰푼품합항행향혀협형활홰회횡훈훼흙흥힘";
const WIN_IN_5 = "갑갱것겉겔곱공궈극긍긴껍낟냐냥넌넥녹뇽눌뉵댕덕뎨딕뚜뜻띠랜렌렙룡뤼륙면명몬밤밴벋봄붓빙빚뻘센셈솥쇼숙싹쌀압엇와용웜웨웰육잣쟝젓죡쥔증짚짜착첨최측칡침켄콘콧킷특팩펀햄헐혜홈환훠휘휴흑흠힐";
const WIN_IN_7 = "곧낮닝닻뎐랑랒뱀빵뻬썩쎄씰앗움으잉족죄짝짬쩡찐찜칙탱텅틀픽";
const WIN_IN_9 = "널늦돗릊먼벵뿔션쇄숭쑹옴퉁학혹";
const WIN_IN_11 = "뜽뮤쐬펑핀";
const WIN_IN_13 = "셔슐켐";

let winTurnMap = {};

function initSearchMetadata() {
    let groups = [
        { chars: WIN_IN_1, turn: 1 },
        { chars: WIN_IN_3, turn: 3 },
        { chars: WIN_IN_5, turn: 5 },
        { chars: WIN_IN_7, turn: 7 },
        { chars: WIN_IN_9, turn: 9 },
        { chars: WIN_IN_11, turn: 11 },
        { chars: WIN_IN_13, turn: 13 }
    ];
    for (let i = 0; i < groups.length; i++) {
        let chars = groups[i].chars;
        for (let j = 0; j < chars.length; j++) {
            winTurnMap[chars[j]] = groups[i].turn;
        }
    }
}

function filterArray(arr) {
    return arr;
}

function filterCurses(str) {
    return str;
}

function getDefeatTurn(syl) {
    return winTurnMap[syl] || null;
}

function formatNormalWithTurns(normal) {
    if (!normal.length) return "";

    let groups = { 1: [], 3: [], 5: [], 7: [], 9: [], 11: [], 13: [], other: [] };
    for (let i = 0; i < normal.length; i++) {
        let word = normal[i];
        let lastSyl = word[word.length - 1];
        let turn = getDefeatTurn(lastSyl);
        if (turn !== null) groups[turn].push(word);
        else groups.other.push(word);
    }

    let result = [];
    let turns = [13, 11, 9, 7, 5, 3, 1];
    for (let i = 0; i < turns.length; i++) {
        let turn = turns[i];
        if (groups[turn].length) {
            result.push("  " + turn + "수 후 패배 [" + groups[turn].length + "개]\n  " + filterArray(groups[turn]).join(", "));
        }
    }
    if (groups.other.length) {
        result.push("  턴 정보 없음 [" + groups.other.length + "개]\n  " + filterArray(groups.other).join(", "));
    }
    return "\n\n< 일반음절 > [" + normal.length + "개]\n" + result.join("\n\n");
}

function handleSearchCommand(msg, replier) {
    if (!(msg.startsWith("1ㄱㅅ ") || msg.startsWith("1검색 "))) return false;
    if (!SEARCH_WORD_LIST || SEARCH_WORD_LIST.length === 0) {
        let loadResult = loadHeavyWords();
        if (!SEARCH_WORD_LIST || SEARCH_WORD_LIST.length === 0) {
            replier.reply("단어 데이터를 불러오지 못했습니다.\n" + loadResult);
            return true;
        }
    }

    let query = msg.substring(msg.indexOf(" ") + 1).toUpperCase().replace(/[^KIRNA,*?\[\]가-힣ㄱ-ㅎ]/g, "").trim();
    if (!query) {
        replier.reply("명령어가 잘못되었습니다.\n예시: 1ㄱㅅ 기*");
        return true;
    }
    if (!query.replace(/[*,\[\] ]/g, "")) {
        replier.reply("모든 단어를 한 번에 불러올 수는 없습니다.");
        return true;
    }
    if (query.length === 1) query += "*";

    let expanded = query.split("A").join(SEARCH_A_CLASS);
    let pattern = expanded
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")
        .replace(/R/g, "[" + ROUTESYL_STR + "]")
        .replace(/I/g, "[" + INTENDSYL_STR + "]")
        .replace(/K/g, "[" + KILLSYL_STR + "]")
        .replace(/N/g, "[" + NORMAL_SYL + "]")
        .replace(/\]\[/g, "")
        .replace(/,/g, "");

    let reg;
    try {
        reg = new RegExp("^" + pattern + "$");
    } catch (e) {
        replier.reply("검색식이 올바르지 않습니다.");
        return true;
    }

    let res = [];
    for (let i = 0; i < SEARCH_WORD_LIST.length; i++) {
        let word = SEARCH_WORD_LIST[i];
        if (reg.test(word)) res.push(word);
    }
    res = Array.from(new Set(res)).sort();

    let kill = [];
    let intend = [];
    let route = [];
    let normal = [];
    let diff = [];

    for (let i = 0; i < res.length; i++) {
        let word = res[i];
        let lastSyl = word[word.length - 1];
        if (isHanbang(word)) kill.push(word);
        else if (isYudo(word)) intend.push(word);
        else if (isRoot(word)) route.push(word);
        else if (NORMAL_SYL.indexOf(lastSyl) !== -1) normal.push(word);
        else diff.push(word);
    }

    let result = [];
    if (kill.length) result.push("\n\n< 한방음절 > [" + kill.length + "개]\n" + filterArray(kill).join(", "));
    if (intend.length) result.push("\n\n< 유도음절 > [" + intend.length + "개]\n" + filterArray(intend).join(", "));
    if (route.length) result.push("\n\n< 루트음절 > [" + route.length + "개]\n" + filterArray(route).join(", "));
    if (normal.length) result.push(formatNormalWithTurns(normal));
    if (diff.length) result.push("\n\n< 기타음절 > [" + diff.length + "개]\n" + filterArray(diff).join(", "));

    let send = "[ '" + filterCurses(query) + "' 구엜룰 단어 검색 결과(" + res.length + "개)" + FULL_VIEW + "\n" + result.join("");
    if (send.length > 100000) {
        replier.reply("카카오톡 전송 가능 최대 글자 수를 초과하여 전송할 수 없습니다.");
    } else {
        replier.reply(send);
    }
    return true;
}

const TIER_RANGES = [
    { name: "바부", min: 0, max: 1, color: "#808080" },
    { name: "바보", min: 1, max: 9, color: "#808080" },
    { name: "밥", min: 10, max: 49, color: "#808080" },
    { name: "ㅂ", min: 50, max: 89, color: "#006400" },
    { name: "\u200b", min: 90, max: 100, color: "#696969" },
    { name: "아이언 V", min: 101, max: 190, color: "#7A7A7A" },
    { name: "아이언 IV", min: 191, max: 280, color: "#7A7A7A" },
    { name: "아이언 III", min: 281, max: 370, color: "#7A7A7A" },
    { name: "아이언 II", min: 371, max: 460, color: "#7A7A7A" },
    { name: "아이언 I", min: 461, max: 550, color: "#7A7A7A" },
    { name: "브론즈 V", min: 551, max: 640, color: "#CD7F32" },
    { name: "브론즈 IV", min: 641, max: 730, color: "#CD7F32" },
    { name: "브론즈 III", min: 731, max: 820, color: "#CD7F32" },
    { name: "브론즈 II", min: 821, max: 910, color: "#CD7F32" },
    { name: "브론즈 I", min: 911, max: 1000, color: "#CD7F32" },
    { name: "실버 V", min: 1001, max: 1080, color: "#C0C0C0" },
    { name: "실버 IV", min: 1081, max: 1159, color: "#C0C0C0" },
    { name: "실버 III", min: 1160, max: 1239, color: "#C0C0C0" },
    { name: "실버 II", min: 1240, max: 1319, color: "#C0C0C0" },
    { name: "실버 I", min: 1320, max: 1399, color: "#C0C0C0" },
    { name: "골드 V", min: 1400, max: 1479, color: "#FFD700" },
    { name: "골드 IV", min: 1480, max: 1559, color: "#FFD700" },
    { name: "골드 III", min: 1560, max: 1639, color: "#FFD700" },
    { name: "골드 II", min: 1640, max: 1719, color: "#FFD700" },
    { name: "골드 I", min: 1720, max: 1799, color: "#FFD700" },
    { name: "플래티넘 V", min: 1800, max: 1879, color: "#E5E4E2" },
    { name: "플래티넘 IV", min: 1880, max: 1959, color: "#E5E4E2" },
    { name: "플래티넘 III", min: 1960, max: 2039, color: "#E5E4E2" },
    { name: "플래티넘 II", min: 2040, max: 2119, color: "#E5E4E2" },
    { name: "플래티넘 I", min: 2120, max: 2199, color: "#E5E4E2" },
    { name: "다이아몬드 V", min: 2200, max: 2279, color: "#B9F2FF" },
    { name: "다이아몬드 IV", min: 2280, max: 2359, color: "#B9F2FF" },
    { name: "다이아몬드 III", min: 2360, max: 2439, color: "#B9F2FF" },
    { name: "다이아몬드 II", min: 2440, max: 2519, color: "#B9F2FF" },
    { name: "다이아몬드 I", min: 2520, max: 2599, color: "#B9F2FF" },
    { name: "마스터 V", min: 2600, max: 2679, color: "#9966CC" },
    { name: "마스터 IV", min: 2680, max: 2759, color: "#9966CC" },
    { name: "마스터 III", min: 2760, max: 2839, color: "#9966CC" },
    { name: "마스터 II", min: 2840, max: 2919, color: "#9966CC" },
    { name: "마스터 I", min: 2920, max: 2999, color: "#9966CC" },
    { name: "그랜드마스터 V", min: 3000, max: 3079, color: "#FF6B6B" },
    { name: "그랜드마스터 IV", min: 3080, max: 3159, color: "#FF6B6B" },
    { name: "그랜드마스터 III", min: 3160, max: 3239, color: "#FF6B6B" },
    { name: "그랜드마스터 II", min: 3240, max: 3319, color: "#FF6B6B" },
    { name: "그랜드마스터 I", min: 3320, max: 3399, color: "#FF6B6B" },
    { name: "챌린저", min: 3400, max: 3999, color: "#FF4500" },
    { name: "히든 V", min: 4000, max: 4199, color: "#8B0000" },
    { name: "히든 IV", min: 4200, max: 4399, color: "#8B0000" },
    { name: "히든 III", min: 4400, max: 4599, color: "#8B0000" },
    { name: "히든 II", min: 4600, max: 4799, color: "#8B0000" },
    { name: "히든 I", min: 4800, max: 4999, color: "#8B0000" },
    { name: "신 V", min: 5000, max: 5999, color: "#FF1493" },
    { name: "신 IV", min: 6000, max: 6999, color: "#FF1493" },
    { name: "신 III", min: 7000, max: 7999, color: "#FF1493" },
    { name: "신 II", min: 8000, max: 8999, color: "#FF1493" },
    { name: "신 I", min: 9000, max: 9999, color: "#FF1493" },
    { name: "초월자 V", min: 10000, max: 10599, color: "#00BFFF" },
    { name: "초월자 IV", min: 10600, max: 11199, color: "#00BFFF" },
    { name: "초월자 III", min: 11200, max: 11799, color: "#00BFFF" },
    { name: "초월자 II", min: 11800, max: 12399, color: "#00BFFF" },
    { name: "초월자 I", min: 12400, max: 12999, color: "#00BFFF" },
    { name: "STAR V", min: 13000, max: 13499, color: "#FFFF00" },
    { name: "STAR IV", min: 13500, max: 13999, color: "#FFFF00" },
    { name: "STAR III", min: 14000, max: 14499, color: "#FFFF00" },
    { name: "STAR II", min: 14500, max: 14999, color: "#FFFF00" },
    { name: "STAR I", min: 15000, max: 15499, color: "#FFFF00" },
    { name: "GALAXY V", min: 15500, max: 16499, color: "#4B0082" },
    { name: "GALAXY IV", min: 16500, max: 17499, color: "#4B0082" },
    { name: "GALAXY III", min: 17500, max: 18499, color: "#4B0082" },
    { name: "GALAXY II", min: 18500, max: 19499, color: "#4B0082" },
    { name: "GALAXY I", min: 19500, max: 20499, color: "#4B0082" },
    { name: "SUPERCLUSTER V", min: 20500, max: 21999, color: "#8A2BE2" },
    { name: "SUPERCLUSTER IV", min: 22000, max: 23499, color: "#8A2BE2" },
    { name: "SUPERCLUSTER III", min: 23500, max: 24999, color: "#8A2BE2" },
    { name: "SUPERCLUSTER II", min: 25000, max: 26499, color: "#8A2BE2" },
    { name: "SUPERCLUSTER I", min: 26500, max: 27999, color: "#8A2BE2" },
    { name: "우주", min: 28000, max: 39999, color: "#000000" },
    { name: "Cn", min: 40000, max: Infinity, color: "#FF00FF" }
];

const JOB_VALUES = {
    "공룡": 3.14159265358,
    "생존자": 2.85,
    "67": 2.8388608,
    "수학자": 2.8,
    "과학자": 2.63,
    "나이트": 2.2360679,
    "작곡가": 2.22,
    "스폰지밥": 2.06,
    "비밀요원": 2.7999,
    "검객": 2.47,
    "환자": 2.22222,
    "시인": 2.131072,
    "악당": 2.13,
    "기자": 2.12121212,
    "은하계전사": 2.12,
    "혜성전사": 2.18,
    "감시자": 2.11111,
    "전우치": 2.1,
    "뜀틀선수": 2.099,
    "사신": 2.088,
    "마하트마간디": 2.081,
    "수리사": 2.08,
    "고죠": 2.5,
    "우라늄": 2.05,
    "마법사": 1.9999,
    "수집가": 1.84,
    "기관사": 1.74,
    "해커": 1.7,
    "시프터": 1.6,
    "투자자": 1.55,
    "사과": 1.31,
    "늑대인간": 1.25
};

const INITIAL_RATING = 100;
const K_FACTOR = 90;
const DEFAULT_JOB_VALUE = 2.0;
const TIER_DATA_DIR = JSON_BASE_PATH;
const TIER_PLAYER_PATH = TIER_DATA_DIR + "/tierbot_data.json";

let tierPlayerData = {};
let tierGames = {};
let authedSenders = {};
let currentPassword = 1248;

function ensureTierDataDir() {
    try {
        FileStream.createDir(TIER_DATA_DIR);
    } catch (e) { }
}

function loadTierData() {
    ensureTierDataDir();
    try {
        tierPlayerData = FileStream.readJson(TIER_PLAYER_PATH) || {};
    } catch (e) {
        tierPlayerData = {};
    }
}

function saveTierData() {
    ensureTierDataDir();
    FileStream.writeJson(TIER_PLAYER_PATH, tierPlayerData);
}

function initTierPlayer(nickname) {
    if (!tierPlayerData[nickname]) {
        tierPlayerData[nickname] = {
            rating: INITIAL_RATING,
            wins: 0,
            losses: 0,
            winStreak: 0,
            games: [],
            jobStats: {}
        };
    }
    if (!tierPlayerData[nickname].games) tierPlayerData[nickname].games = [];
    if (!tierPlayerData[nickname].jobStats) tierPlayerData[nickname].jobStats = {};
    if (typeof tierPlayerData[nickname].winStreak !== "number") tierPlayerData[nickname].winStreak = 0;
}

function getTier(rating) {
    for (let i = 0; i < TIER_RANGES.length; i++) {
        let tier = TIER_RANGES[i];
        if (rating >= tier.min && rating <= tier.max) return tier.name;
    }
    return "심해 그 아래";
}

function getJobValue(jobName) {
    return JOB_VALUES[jobName] || DEFAULT_JOB_VALUE;
}

function calculateElo(winner, loser, multiplier, winnerJob, loserJob) {
    initTierPlayer(winner);
    initTierPlayer(loser);

    multiplier = Number(multiplier) || 1;

    let winnerRating = tierPlayerData[winner].rating;
    let loserRating = tierPlayerData[loser].rating;
    let winnerCurrentStreak = (tierPlayerData[winner].winStreak || 0) + 1;
    let loserCurrentStreak = tierPlayerData[loser].winStreak || 0;
    let ratingDiff = loserRating - winnerRating;

    let expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    let expectedLoser = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));

    let baseWinner = Math.round(K_FACTOR * (1 - expectedWinner));
    let baseLoser = Math.round(K_FACTOR * (0 - expectedLoser));

    let wStreakVal = Math.pow(winnerCurrentStreak, 2);
    let lStreakVal = loserCurrentStreak > 0 ? Math.sqrt(loserCurrentStreak) : 1;
    let streakMultiplier = wStreakVal * lStreakVal;

    let upsetScore = 0;
    if (ratingDiff > 0) {
        upsetScore = Math.floor((ratingDiff / 500 * Math.sqrt(ratingDiff)) / 3);
    } else {
        upsetScore = -Math.floor((Math.abs(ratingDiff) / 500 * Math.sqrt(Math.abs(ratingDiff))) / 3);
    }

    let jobBonus = getJobValue(loserJob) / getJobValue(winnerJob);
    let winnerCalcStep1 = (baseWinner * streakMultiplier) + upsetScore;
    if (winnerCalcStep1 < 1) winnerCalcStep1 = 1;

    let loserCalcStep1 = baseLoser - upsetScore;
    if (loserCalcStep1 > -1) loserCalcStep1 = -1;

    let finalWinnerChange = Math.round(winnerCalcStep1 * jobBonus * multiplier);
    let finalLoserChange = Math.round(loserCalcStep1 * jobBonus * multiplier);

    tierPlayerData[winner].rating += finalWinnerChange;
    tierPlayerData[loser].rating += finalLoserChange;
    if (tierPlayerData[winner].rating < 0) tierPlayerData[winner].rating = 0;
    if (tierPlayerData[loser].rating < 0) tierPlayerData[loser].rating = 0;

    return {
        wChange: finalWinnerChange,
        lChange: finalLoserChange,
        math: {
            wBase: baseWinner,
            lBase: baseLoser,
            wStreak: winnerCurrentStreak,
            lStreak: loserCurrentStreak,
            stMult: streakMultiplier.toFixed(2),
            upset: upsetScore,
            job: jobBonus.toFixed(3),
            gameMult: multiplier
        }
    };
}

function updateJobStats(nickname, job, isWin) {
    initTierPlayer(nickname);
    if (!tierPlayerData[nickname].jobStats[job]) {
        tierPlayerData[nickname].jobStats[job] = { picks: 0, wins: 0, losses: 0 };
    }
    tierPlayerData[nickname].jobStats[job].picks++;
    if (isWin) tierPlayerData[nickname].jobStats[job].wins++;
    else tierPlayerData[nickname].jobStats[job].losses++;
}

function pickTierMultiplier() {
    let multiplier;
    if (Math.random() < 0.5) multiplier = 1.0 + Math.random() * 0.5;
    else if (Math.random() < 0.99) multiplier = 2.5 + Math.random() * 1.5;
    else multiplier = 10.0 + Math.random() * 40.0;
    return Math.round(multiplier * 10) / 10;
}

function clearTierGame(roomName) {
    if (tierGames[roomName]) delete tierGames[roomName];
}

function startTierGame(roomName, player1, player2, player1Job, player2Job, replier) {
    if (!(roomName && player1 && player2)) return;
    let multiplier = pickTierMultiplier();

    tierGames[roomName] = {
        player1: player1,
        player2: player2,
        isTierGame: true,
        player1Job: player1Job,
        player2Job: player2Job,
        multiplier: multiplier
    };

    replier.reply("이번 판 점수 배율: " + multiplier + "배");
}

function finishTierGame(roomName, winner, winType, replier) {
    if (!tierGames[roomName]) return;

    let game = tierGames[roomName];
    let loser = null;
    if (winner === game.player1) loser = game.player2;
    else if (winner === game.player2) loser = game.player1;

    if (!(winner && loser)) {
        clearTierGame(roomName);
        return;
    }

    if (!game.isTierGame) {
        clearTierGame(roomName);
        return;
    }

    let multiplier = game.multiplier || 1.0;
    let winnerJob = (winner === game.player1) ? game.player1Job : game.player2Job;
    let loserJob = (loser === game.player1) ? game.player1Job : game.player2Job;
    let result = calculateElo(winner, loser, multiplier, winnerJob, loserJob);
    let math = result.math;

    tierPlayerData[winner].wins++;
    tierPlayerData[winner].winStreak++;
    tierPlayerData[loser].losses++;
    tierPlayerData[loser].winStreak = 0;

    if (winnerJob) updateJobStats(winner, winnerJob, true);
    if (loserJob) updateJobStats(loser, loserJob, false);

    tierPlayerData[winner].games.push({
        date: new Date().toISOString(),
        opponent: loser,
        result: winType,
        ratingChange: result.wChange,
        newRating: tierPlayerData[winner].rating,
        job: winnerJob || "미기록",
        multiplier: multiplier
    });
    tierPlayerData[loser].games.push({
        date: new Date().toISOString(),
        opponent: winner,
        result: winType,
        ratingChange: result.lChange,
        newRating: tierPlayerData[loser].rating,
        job: loserJob || "미기록",
        multiplier: multiplier
    });
    saveTierData();

    let wTier = getTier(tierPlayerData[winner].rating);
    let lTier = getTier(tierPlayerData[loser].rating);
    let wUpsetStr = math.upset >= 0 ? "+ " + math.upset : "- " + Math.abs(math.upset);
    let lUpsetStr = math.upset >= 0 ? "- " + math.upset : "+ " + Math.abs(math.upset);

    replier.reply(
        "[ 티어전 결과 ] " + multiplier + "배\n\n" +
        winner + " 승리! " + (winnerJob ? "(" + winnerJob + ")" : "") + "\n" +
        "레이팅: " + (tierPlayerData[winner].rating - result.wChange) + "에서 " + tierPlayerData[winner].rating + " (" + (result.wChange >= 0 ? "+" : "") + result.wChange + ")\n" +
        "티어: " + wTier + " (" + tierPlayerData[winner].winStreak + "연승)\n\n" +
        loser + " 패배 " + (loserJob ? "(" + loserJob + ")" : "") + "\n" +
        "레이팅: " + (tierPlayerData[loser].rating - result.lChange) + "에서 " + tierPlayerData[loser].rating + " (" + result.lChange + ")\n" +
        "티어: " + lTier + "\n\n" +
        "점수 계산\n" +
        "[승자] " + result.wChange + " = ((기본" + math.wBase + " × 연승" + math.stMult + ") " + wUpsetStr + ") × 직업" + math.job + " × 배율" + math.gameMult + "\n" +
        "[패자] " + result.lChange + " = (기본" + math.lBase + " " + lUpsetStr + ") × 직업" + math.job + " × 배율" + math.gameMult
    );

    clearTierGame(roomName);
}

function detectGameStart(msg, roomName, replier) {
    let playerMatch = msg.match(/(.+?)\s*님과\s*(.+?)\s*님의\s*채린룰\s*끝말잇기가\s*시작되었습니다/);
    if (!playerMatch) return;

    let player1 = playerMatch[1].trim();
    let player2 = playerMatch[2].trim();
    let jobPattern = /\{\s*(.+?)\s*:\s*(.+?)\s*\}/g;
    let player1Job = null;
    let player2Job = null;
    let match;

    while ((match = jobPattern.exec(msg)) !== null) {
        let name = match[1].trim();
        let job = match[2].trim();
        if (name === player1) player1Job = job;
        else if (name === player2) player2Job = job;
    }

    startTierGame(roomName, player1, player2, player1Job, player2Job, replier);
}

function processGameEnd(msg, roomName, replier) {
    if (!tierGames[roomName]) return;

    let game = tierGames[roomName];
    let winner = null;
    let winType = "";

    let giveUpMatch = msg.match(/\{\s*채린룰\s*\}\s*(.+?)\s*님이 기권하셨습니다\.[\s\S]*?※\s*(.+?)\s*님의 승리입니다!/);
    if (giveUpMatch) {
        winner = giveUpMatch[2].trim();
        winType = "기권";
    }

    if (!winner) {
        let afkMatch = msg.match(/\{\s*채린룰\s*\}\s*잠수로 판단되어\s*(.+?)\s*님의 패배로 게임을 종료하였습니다/);
        if (afkMatch) {
            let loser = afkMatch[1].trim();
            winner = (loser === game.player1) ? game.player2 : game.player1;
            winType = "잠수";
        }
    }

    if (!winner && msg.indexOf("§") !== -1 && msg.indexOf("승리") !== -1) {
        let special = msg.match(/§(.+?)§/);
        if (special) {
            if (msg.indexOf(game.player1 + " 님") !== -1) winner = game.player1;
            else if (msg.indexOf(game.player2 + " 님") !== -1) winner = game.player2;
            if (winner) winType = "특수:" + special[1].trim();
        }
    }

    if (!winner) {
        let normalMatch = msg.match(/※\s*(.+?)\s*님.*?승리하[셨였]습니다/);
        if (normalMatch) {
            winner = normalMatch[1].trim();
            winType = "일반";
        }
    }

    if (!winner) {
        clearTierGame(roomName);
        return;
    }

    finishTierGame(roomName, winner, winType, replier);
}

function makeComment(player) {
    let total = player.wins + player.losses;
    if (total < 5) return "전적이 부족해 성장 방향 분석 불가";

    let winRate = player.wins / total;
    if (winRate >= 0.7) return "상위권 실력대. 메타 이해도가 높음.";
    if (winRate >= 0.6) return "강점이 뚜렷한 성장형 플레이어.";
    if (winRate >= 0.5) return "기본기는 있으나 결정력이 부족함.";
    return "운영 전반의 재정비가 필요한 단계.";
}

function showTierInfo(nickname, replier) {
    initTierPlayer(nickname);
    let data = tierPlayerData[nickname];
    let tier = getTier(data.rating);
    let totalGames = data.wins + data.losses;
    let winRate = totalGames > 0 ? ((data.wins / totalGames) * 100).toFixed(1) : "0.0";
    let jobEntries = Object.keys(data.jobStats || {});
    let msg = "[ " + nickname + "님의 티어 정보 ]\n\n" +
        "티어: " + tier + "\n" +
        "레이팅: " + data.rating + "\n" +
        "전적: " + data.wins + "승 " + data.losses + "패 (" + winRate + "%)\n" +
        "연승: " + data.winStreak + "연승\n" +
        "총 게임 수: " + totalGames + "게임\n";

    if (jobEntries.length > 0) {
        let rows = [];
        for (let i = 0; i < jobEntries.length; i++) {
            let job = jobEntries[i];
            let stats = data.jobStats[job];
            let jobWinRate = stats.picks > 0 ? ((stats.wins / stats.picks) * 100).toFixed(1) : "0.0";
            rows.push({ job: job, picks: stats.picks, wins: stats.wins, losses: stats.losses, winRate: Number(jobWinRate) });
        }
        rows.sort(function (a, b) { return b.winRate - a.winRate; });
        msg += "\n[ 직업별 통계 ]\n\n";
        for (let i = 0; i < rows.length; i++) {
            let row = rows[i];
            msg += row.job + "\n" +
                "픽: " + row.picks + "판\n" +
                "승률: " + row.winRate.toFixed(1) + "% (" + row.wins + "승 " + row.losses + "패)\n\n";
        }
    }

    msg += "[ 코멘트 ]\n" + makeComment(data);
    replier.reply(foldByVisibleLines(msg, 1));
}

function showRanking(replier) {
    let players = [];
    let names = Object.keys(tierPlayerData);
    for (let i = 0; i < names.length; i++) {
        let name = names[i];
        players.push({
            name: name,
            rating: tierPlayerData[name].rating,
            wins: tierPlayerData[name].wins,
            losses: tierPlayerData[name].losses,
            tier: getTier(tierPlayerData[name].rating)
        });
    }
    players.sort(function (a, b) { return b.rating - a.rating; });

    let msg = "[ 채린룰 티어 랭킹 ]\n\n";
    if (!players.length) {
        replier.reply(foldByVisibleLines(msg + "아직 기록된 플레이어가 없습니다.", 1));
        return;
    }
    for (let i = 0; i < players.length; i++) {
        let medal = (i === 0) ? "1." : (i === 1) ? "2." : (i === 2) ? "3." : (i + 1) + ".";
        msg += medal + " " + players[i].name + "\n" +
            players[i].tier + " | " + players[i].rating + "점 | " + players[i].wins + "승 " + players[i].losses + "패\n\n";
    }
    replier.reply(foldByVisibleLines(msg, 1));
}

function showJobRanking(replier) {
    let globalJobStats = {};
    let playerNames = Object.keys(tierPlayerData);
    for (let i = 0; i < playerNames.length; i++) {
        let jobStats = tierPlayerData[playerNames[i]].jobStats || {};
        let jobs = Object.keys(jobStats);
        for (let j = 0; j < jobs.length; j++) {
            let job = jobs[j];
            if (!globalJobStats[job]) globalJobStats[job] = { picks: 0, wins: 0, losses: 0 };
            globalJobStats[job].picks += jobStats[job].picks;
            globalJobStats[job].wins += jobStats[job].wins;
            globalJobStats[job].losses += jobStats[job].losses;
        }
    }

    let jobs = Object.keys(globalJobStats);
    if (!jobs.length) {
        replier.reply(foldByVisibleLines("[ 전체 직업 통계 ]\n\n아직 기록된 직업 통계가 없습니다.", 1));
        return;
    }
    jobs.sort(function (a, b) { return globalJobStats[b].picks - globalJobStats[a].picks; });

    let totalPicks = 0;
    for (let i = 0; i < jobs.length; i++) totalPicks += globalJobStats[jobs[i]].picks;

    let msg = "[ 전체 직업 통계 ]\n\n";
    for (let i = 0; i < jobs.length && i < 10; i++) {
        let job = jobs[i];
        let stats = globalJobStats[job];
        let pickRate = totalPicks > 0 ? ((stats.picks / totalPicks) * 100).toFixed(1) : "0.0";
        let winRate = stats.picks > 0 ? ((stats.wins / stats.picks) * 100).toFixed(1) : "0.0";
        msg += (i + 1) + ". " + job + "\n" +
            "픽률: " + pickRate + "% (" + stats.picks + "판)\n" +
            "승률: " + winRate + "% (" + stats.wins + "승 " + stats.losses + "패)\n\n";
    }
    replier.reply(foldByVisibleLines(msg, 1));
}

function showJobStats(jobName, replier) {
    let totalPicks = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let playerStats = [];
    let playerNames = Object.keys(tierPlayerData);

    for (let i = 0; i < playerNames.length; i++) {
        let name = playerNames[i];
        let jobStats = tierPlayerData[name].jobStats || {};
        if (!jobStats[jobName]) continue;
        let stats = jobStats[jobName];
        totalPicks += stats.picks;
        totalWins += stats.wins;
        totalLosses += stats.losses;
        playerStats.push({
            name: name,
            picks: stats.picks,
            wins: stats.wins,
            losses: stats.losses,
            winRate: stats.picks > 0 ? (stats.wins / stats.picks * 100) : 0
        });
    }

    if (!totalPicks) {
        replier.reply(foldByVisibleLines("[ " + jobName + " 직업 통계 ]\n\n기록이 없습니다.", 1));
        return;
    }

    playerStats.sort(function (a, b) { return b.winRate - a.winRate; });

    let master = null;
    for (let i = 0; i < playerStats.length; i++) {
        if (playerStats[i].picks >= 10) {
            master = playerStats[i];
            break;
        }
    }

    let lover = playerStats.slice().sort(function (a, b) { return b.picks - a.picks; })[0];
    let msg = "[ " + jobName + " 직업 통계 ]\n\n" +
        "전체 픽: " + totalPicks + "판\n" +
        "전체 승률: " + ((totalWins / totalPicks) * 100).toFixed(1) + "% (" + totalWins + "승 " + totalLosses + "패)\n\n";
    if (master) msg += "마스터: " + master.name + " (" + master.winRate.toFixed(1) + "% / " + master.picks + "판)\n";
    if (lover) msg += "애용자: " + lover.name + " (" + lover.picks + "판)\n";
    msg += "\n[ 플레이어별 승률 ]\n\n";
    for (let i = 0; i < playerStats.length; i++) {
        let p = playerStats[i];
        msg += (i + 1) + ". " + p.name + "\n" +
            "승률: " + p.winRate.toFixed(1) + "% (" + p.wins + "승 " + p.losses + "패)\n" +
            "픽: " + p.picks + "판\n\n";
    }
    replier.reply(foldByVisibleLines(msg, 1));
}


function normalizeJobName(job) {
    let name = String(job == null ? "" : job).trim();
    if (name === "ㅎㅋ") name = "해커";
    if (name === "ㅌㅈㅈ") name = "투자자";
    return name;
}

function getSelectableJobs(game, sender) {
    let jobs = ALL_JOBS.slice();
    if (!game || game.phase !== "job_selection") return jobs;
    if (game.firstPicker && sender !== game.firstPicker && game.bannedJobs && game.bannedJobs.length > 0) {
        jobs = jobs.filter(function (job) { return !game.bannedJobs.includes(job); });
    }
    return jobs;
}

function handleJobSelection(game, sender, job, replier, pickedByRandom) {
    if (!game || game.phase !== "job_selection") return false;
    if (!game.players.includes(sender)) return true;

    job = normalizeJobName(job);
    if (!ALL_JOBS.includes(job)) {
        replier.reply("존재하지 않거나 선택할 수 없는 직업입니다.");
        return true;
    }
    if (game.playerStates[sender]) {
        replier.reply("이미 직업을 선택하셨습니다.");
        return true;
    }

    if (game.banPhase && sender !== game.firstPicker) {
        replier.reply(joinFoldedLines([
            systemLine("아직 밴 단계다."),
            systemLine(game.firstPicker + "이 " + PREFIX + "밴 직업명들 형식으로 입력해야 한다.")
        ], [
            systemLine("예시: " + PREFIX + "밴 해커 기관사 사신"),
            systemLine("밴 없이 진행하려면 " + PREFIX + "밴 만 입력하면 된다.")
        ]));
        return true;
    }

    if (sender !== game.firstPicker && game.bannedJobs.includes(job)) {
        replier.reply(joinFoldedLines([
            systemLine(job + "은 이미 밴된 직업이다."),
            systemLine("밴 목록: [" + game.bannedJobs.join(", ") + "]")
        ], [
            systemLine("선택 가능 직업: [" + getSelectableJobs(game, sender).join(", ") + "]")
        ]));
        return true;
    }

    game.playerStates[sender] = initJobState(job);
    let pickedText = pickedByRandom ? "로 랜덤 선택됐다." : "로 선택됐다.";

    if (!game.firstPicker) {
        game.firstPicker = sender;
        game.banPhase = true;
        replier.reply(joinFoldedLines([
            systemLine(sender + "의 직업이 " + job + pickedText),
            systemLine("상대 직업을 최대 6개까지 밴할 수 있다."),
            systemLine("명령어: " + PREFIX + "밴 직업1 직업2 직업3")
        ], [
            systemLine("예시: " + PREFIX + "밴 해커 기관사 사신"),
            systemLine("밴 없이 진행하려면 " + PREFIX + "밴 만 입력하면 된다."),
            systemLine("전체 직업 목록: [" + ALL_JOBS.join(", ") + "]")
        ]));
        return true;
    }

    replySystem(replier, sender + "의 직업이 " + job + pickedText);

    if (Object.keys(game.playerStates).length === 2) {
        game.phase = "playing";
        game.lastPlayTime = Date.now();
        let p1 = game.players[0];
        let p2 = game.players[1];
        let p1_job = game.playerStates[p1].job;
        let p2_job = game.playerStates[p2].job;
        let startMsg = joinFoldedLines([
            systemLine("끝말잇기 경기가 시작됩니다."),
            systemLine("참가자: " + p1 + "(" + p1_job + "), " + p2 + "(" + p2_job + ")"),
            jobLine(p1_job, getJobDialogue(p1_job, "start", null, "준비를 마쳤다.")),
            jobLine(p2_job, getJobDialogue(p2_job, "start", null, "준비를 마쳤다."))
        ], [
            systemLine("시작은 아무나 할 수 있습니다."),
            systemLine("단어 입력: 0단어"),
            systemLine("능력 사용: 2능력명"),
            systemLine("현황 확인: 1상태"),
            systemLine("무효 요청: 1무효"),
            systemLine("무르기 요청: 1무르기 단어"),
            systemLine("입장 바꾸기: 1바꾸기"),
            systemLine("기권: ㅈㅈ"),
            systemLine("잠수 확인: 1킥"),
            systemLine("첫 수에는 한방단어와 유도단어를 사용할 수 없습니다."),
            systemLine("두음법칙: 라 나, 래 내, 로 노, 루 누, 르 느, 뢰 뇌, 랴 야, 럐 얘, 료 요, 류 유, 리 이, 례 예, 녀 여, 뇨 요, 뉴 유, 니 이")
        ]);
        replier.reply(startMsg);
        startTierGame(room, p1, p2, p1_job, p2_job, replier);
    }
    return true;
}


function handleTierBotMessage(room, msg, sender, replier) {
    if (msg.startsWith(".pw ")) {
        authedSenders[sender] = String(msg.slice(4).trim()) === String(currentPassword);
        return true;
    }

    if (msg.startsWith(".set ")) {
        if (!authedSenders[sender]) {
            replier.reply("비밀번호부터 입력하세요.");
            return true;
        }
        let parts = msg.slice(5).trim().split("|");
        let nickname = parts[0];
        let rating = Number(parts[1]);
        if (!tierPlayerData[nickname]) {
            replier.reply("존재하지 않는 플레이어입니다.");
            return true;
        }
        if (isNaN(rating)) {
            replier.reply("레이팅 값이 올바르지 않습니다.");
            return true;
        }
        tierPlayerData[nickname].rating = rating;
        saveTierData();
        currentPassword = Math.floor(1000 + Math.random() * 9000);
        authedSenders[sender] = false;
        replier.reply(nickname + " 레이팅을 " + rating + "으로 변경했습니다.");
        return true;
    }

    if (msg.startsWith(".rs ")) {
        if (!authedSenders[sender]) {
            replier.reply("비밀번호부터 입력하세요.");
            return true;
        }
        let parts = msg.slice(4).trim().split("|");
        if (parts.length < 3) {
            replier.reply("사용법: .rs 승자|패자|배율");
            return true;
        }
        let winner = parts[0];
        let loser = parts[1];
        let multiplier = Number(parts[2]) || 1;
        let changes = calculateElo(winner, loser, multiplier, null, null);
        tierPlayerData[winner].wins++;
        tierPlayerData[winner].winStreak++;
        tierPlayerData[loser].losses++;
        tierPlayerData[loser].winStreak = 0;
        saveTierData();
        currentPassword = Math.floor(1000 + Math.random() * 9000);
        authedSenders[sender] = false;
        replier.reply(
            "[ 관리자 승부 설정 완료 ]\n\n" +
            winner + " 승리\n" +
            "레이팅: " + (tierPlayerData[winner].rating - changes.wChange) + "에서 " + tierPlayerData[winner].rating + "\n" +
            loser + " 패배\n" +
            "레이팅: " + (tierPlayerData[loser].rating - changes.lChange) + "에서 " + tierPlayerData[loser].rating
        );
        return true;
    }

    if (msg === "1채린랭킹" || msg === "1ㅊㄹㅋ") {
        showRanking(replier);
        return true;
    }
    if (msg === "1ㅊㅌ" || msg === "1ㅊㄹㅌㅇ" || msg === "1채린티어") {
        showTierInfo(sender, replier);
        return true;
    }
    if (msg.startsWith("1ㅊㅌ ") || msg.startsWith("1ㅊㄹㅌㅇ ") || msg.startsWith("1채린티어 ")) {
        let targetNick = msg.replace(/^1ㅊㅌ\s+/, "").replace(/^1ㅊㄹㅌㅇ\s+/, "").replace(/^1채린티어\s+/, "").trim();
        showTierInfo(targetNick, replier);
        return true;
    }
    if (msg === "1직업통계" || msg === "1ㅈㅌ" || msg === "1직업랭킹") {
        showJobRanking(replier);
        return true;
    }
    if (msg.startsWith("1직업통계 ") || msg.startsWith("1ㅈㅌ ") || msg.startsWith("1직업랭킹 ")) {
        let jobName = msg.replace(/^1직업통계\s+/, "").replace(/^1ㅈㅌ\s+/, "").replace(/^1직업랭킹\s+/, "").trim();
        showJobStats(jobName, replier);
        return true;
    }
    if (msg === "1ㅊㅌㅇ") {
        replier.reply(`[채린룰 직업 티어표] (반박 시 순위 바꿔드림)
왼쪽으로 갈수록 더 좋습니다.
OP: 고죠 [2.85], 스폰지밥 [2.7999], 작곡가 [2.7], 나이트 [2.676767]
S: 갈릴레오갈릴레이: [2.524288], 우라늄 [2.5], 마하트마간디 [2.456], 비밀요원 [2.4]
A: 수리사 [2.3], 67 [2.262144], 수학자 [2.25], 환자 [2.22222], 혜성전사 [2.1415926]
B: 시인 [2.131072], 악당 [2.13], 감시자 [2.11111], 전우치 [2.1111], 검객 [2.099], 뜀틀선수 [2.097152], 사신 [2.088]
C: 공룡 [2.051], 은하계전사 [2.05], 생존자 [2], 기자 [1.9999], 마법사 [1.9999], 해커 [1.7], 시프터 [1.6]
D: 수집가 [1.444], 기관사 [1.4], 사과 [1.35], 투자자 [1.25], 늑대인간 [1]`);
        return true;
    }
    if (msg.split(" ")[0] === "1ㅈㅊ") {
        let targetJob = msg.split(" ")[1];
        let recommend = {
            "기자": { name: "뜀틀선수", reason: "거짓 보도 타이밍을 뜀틀로 끊기 쉽습니다." },
            "악당": { name: "해커", reason: "결계 운영을 복제와 운영 교란으로 흔들기 좋습니다." },
            "검객": { name: "마하트마간디", reason: "능력 의존도가 높은 검객을 비폭력 스택으로 압박하기 좋습니다." },
            "시인": { name: "뜀틀선수", reason: "강제 2글자 운영을 뜀틀 한 번으로 되받아칠 수 있습니다." },
            "공룡": { name: "해커", reason: "브레스와 긴 운영 구간을 교란하는 쪽이 안정적입니다." }
        };
        if (!targetJob) {
            replier.reply("사용법: 1ㅈㅊ [상대 직업]");
            return true;
        }
        if (!recommend[targetJob]) {
            replier.reply("해당 직업의 추천 데이터가 없습니다.");
            return true;
        }
        replier.reply(targetJob + " 상대로는 " + recommend[targetJob].name + " 추천. " + recommend[targetJob].reason);
        return true;
    }

    return false;
}

initSearchMetadata();
loadTierData();
loadHeavyWords();


function response(room, msg, sender, isGroupChat, replier, imageDB, packageName, isMultiChat) {
    replier = createSafeReplier(replier);
    let senderHash = "";
    try {
        senderHash = imageDB && imageDB.getProfileHash ? String(imageDB.getProfileHash()) : "";
    } catch (e) {
        senderHash = "";
    }
    let isAdmin = (senderHash === "1003380129");

    if (isAdmin) {
        if (msg === ADMIN_PFX + " switch on") {
            isOn = true;
            replier.reply("1:On");
        }
        else if (msg === ADMIN_PFX + " switch off") {
            isOn = false;
            replier.reply("1:Off");
        }
    }
    if (!(isOn)) return;
    if (!(isGroupChat)) return;

    if (handleSearchCommand(msg, replier)) return;
    if (handleTierBotMessage(room, msg, sender, replier)) return;

    let game = games[room];

    // --- 도움말 ---
    if (msg === "%도움말" || msg === "%ㄷㅇㅁ") {
        replier.reply(joinFoldedLines([
            systemLine("채린룰 끝말잇기 도움말"),
            systemLine(PREFIX + "채린: 참가 및 시작"),
            systemLine(PREFIX + "ㅈㅅ 직업명: 게임 참가 시 직업 선택"),
            systemLine(PREFIX + "ㅈㅂ 직업명: 직업 정보 보기")
        ], [
            systemLine(PREFIX + "ㅈㅅㄹㄷ: 직업 랜덤 고르기"),
            systemLine(PREFIX + "ㅈㅇ: 직업 목록"),
            systemLine(PREFIX + "상태: 현황 확인"),
            systemLine(PREFIX + "무르기 단어: 무르기 요청"),
            systemLine(PREFIX + "무효: 무효 요청"),
            systemLine(PREFIX + "바꾸기: 첫 단어 입장 바꾸기 요청"),
            systemLine(PREFIX + "킥: 잠수 유저 확인"),
            systemLine("1ㄱㅅ 검색식: 구엜룰 단어 검색"),
            systemLine("1채린랭킹, 1채린티어, 1직업통계, 1ㅊㅌㅇ: 티어와 통계, 투표"),
            systemLine("2능력명: 능력 사용 예시 2조작"),
            systemLine(INPUT_PFX + "단어: 단어 입력"),
            systemLine("ㅈㅈ: 기권 및 종료")
        ]));
        return;
    }

    // 비어있는 방 무시 (일부 명령어 대응)
    if (msg === "ㅈㅈ" && (!game || !game.players.includes(sender))) return;

    // --- 잠수 체크(1킥) ---
    if (game) {
        let now = Date.now();
        // 이미 투표가 진행 중인 경우
        if (game.kickVote && game.kickVote.target) {
            if (sender === game.kickVote.target) {
                if (now - game.kickVote.startTime <= 15000) {
                    game.kickVote = { target: null, startTime: null };
                    replySystem(replier, sender + "의 응답이 확인되어 강퇴가 취소된다.");
                } else {
                    replySystem(replier, sender + "이 잠수 제한시간 15초를 넘겨 강퇴된다.");
                    let winner = game.players.find(function (p) { return p !== sender; });
                    replySystem(replier, "경기가 끝난다. 승자는 " + winner + "이다.");
                    finishTierGame(room, winner, "잠수", replier);
                    delete games[room];
                    return;
                }
            } else if (msg === PREFIX + "킥" || msg === PREFIX + "ㅋ" || (now - game.kickVote.startTime > 15000 && (msg.startsWith(INPUT_PFX) || msg.startsWith(PREFIX)))) {
                if (now - game.kickVote.startTime > 15000) {
                    replySystem(replier, game.kickVote.target + "이 제한시간 15초를 넘겨 잠수로 강퇴된다.");
                    let winner = game.players.find(function (p) { return p !== game.kickVote.target; });
                    replySystem(replier, "경기가 끝난다. 승자는 " + winner + "이다.");
                    finishTierGame(room, winner, "잠수", replier);
                    delete games[room];
                    return;
                }
            }
        }

        // 투표 생성 로직
        if ((msg === PREFIX + "킥" || msg === PREFIX + "ㅋ") && (!game.kickVote || !game.kickVote.target) && game.currentTurnIndex !== -1) {
            let target = game.players[game.currentTurnIndex];
            let timeDiff = now - game.lastPlayTime;

            if (timeDiff >= 3 * 60 * 60 * 1000) { // 3시간
                replySystem(replier, target + "이 3시간 이상 잠수해 즉시 강퇴된다.");
                let winner = game.players.find(function (p) { return p !== target; });
                replySystem(replier, "경기가 끝난다. 승자는 " + winner + "이다.");
                finishTierGame(room, winner, "잠수", replier);
                delete games[room];
                return;
            } else if (timeDiff >= 2 * 60 * 1000) { // 2분
                game.kickVote = { target: target, startTime: now };
                replier.reply(joinLines([
                    systemLine("잠수 판정으로 1킥이 발동된다."),
                    systemLine(target + "은 15초 안에 아무 채팅이나 입력해야 한다.")
                ]));
                return;
            } else {
                { replySystem(replier, "아직 잠수 기준인 2분을 넘기지 않았다."); return; }
            }
        }
    }

    // --- 무르기 / 무효 투표 대기 상태 처리 ---
    if (game && game.isWaitingVote) {
        if (msg === PREFIX + "동의" || msg === PREFIX + "ㄷㅇ" || msg === PREFIX + "거절" || msg === PREFIX + "ㄱㅈ") {
            if (sender === game.requester) { replier.reply(sender + "님은 요청자이므로 결정할 수 없습니다."); return; }

            if (msg === PREFIX + "동의" || msg === PREFIX + "ㄷㅇ") {
                if (game.voteType === "무르기") {
                    let idx = game.history.indexOf(game.targetWord);
                    let removed = game.history.splice(idx + 1);
                    removed.forEach(function (w) { game.used.delete(w); });

                    let targetWord = game.targetWord;
                    let lastChar = targetWord[targetWord.length - 1];
                    game.lastLetter.s1 = applyDuEum(lastChar);
                    game.lastLetter.s2 = lastChar;

                    game.currentTurnIndex = (game.firstTurnIndex + game.history.length) % 2;
                    game.turnCount = Math.floor(game.history.length / 2) + 1;

                    replier.reply(buildStatusMsg(game));
                } else if (game.voteType === "무효") {
                    replySystem(replier, "무효 요청이 받아들여져 이번 경기는 취소된다.");
                    clearTierGame(room);
                    delete games[room];
                    return;
                }

                game.isWaitingVote = false;
                game.targetWord = null;
                game.requester = null;
                game.voteType = null;
            }
            else if (msg === PREFIX + "거절" || msg === PREFIX + "ㄱㅈ") {
                replySystem(replier, game.voteType + " 요청이 거절되어 경기를 계속한다.");
                game.isWaitingVote = false;
                game.targetWord = null;
                game.requester = null;
                game.voteType = null;
            }
            return;
        }
        else if (msg.startsWith(PREFIX) || msg.startsWith(INPUT_PFX)) {
            { replySystem(replier, "현재 " + game.voteType + " 투표 중이다. " + PREFIX + "동의 또는 " + PREFIX + "거절을 먼저 입력해야 한다."); return; }
        }
    }

    // --- 무효 요청 ---
    if (msg === PREFIX + "무효" || msg === PREFIX + "ㅁㅎ") {
        if (!game || !game.started || game.phase !== "playing") return;
        game.isWaitingVote = true;
        game.voteType = "무효";
        game.requester = sender;
        replier.reply(joinLines([
            systemLine(sender + "이 무효를 요청했다."),
            systemLine("상대는 " + PREFIX + "동의 또는 " + PREFIX + "거절을 입력해야 한다.")
        ]));
        return;
    }

    // --- 무르기 요청 ---
    if (msg.startsWith(PREFIX + "무르기 ") || msg.startsWith(PREFIX + "ㅁㄹㄱ ")) {
        if (!game || !game.started || game.phase !== "playing") return;
        let targetWord = msg.split(" ")[1];
        if (game.history.indexOf(targetWord) === -1) { replier.reply("기보에 없는 단어입니다: " + targetWord); return; }

        game.isWaitingVote = true;
        game.voteType = "무르기";
        game.targetWord = targetWord;
        game.requester = sender;

        replier.reply(joinLines([
            systemLine(sender + "이 " + targetWord + " 시점으로 무르기를 요청했다."),
            systemLine("상대는 " + PREFIX + "동의 또는 " + PREFIX + "거절을 입력해야 한다.")
        ]));
        return;
    }

    // --- 입장 바꾸기 ---
    if (msg === PREFIX + "바꾸기" || msg === PREFIX + "ㅂㄲㄱ") {
        if (!game || !game.started || game.phase !== "playing") return;
        if (game.players.includes(sender)) {
            if (game.history.length === 1 && sender !== game.players[game.firstTurnIndex]) {
                game.firstTurnIndex = game.players.indexOf(sender);
                game.currentTurnIndex = (game.firstTurnIndex + 1) % 2; // 차례가 원래 첫 대상자에게 넘어감
                replier.reply(joinLines([
                    systemLine(sender + "이 " + game.history[0] + " 단어로 선공을 가져간다."),
                    systemLine("다음 차례는 " + game.players[game.currentTurnIndex] + "이다.")
                ]));
            } else {
                replier.reply("바꾸기는 상대방이 첫 턴 단어를 제출한 직후에만 사용할 수 있습니다.");
            }
        }
        return;
    }

    // --- 관리자 명령어 ---
    if (msg.startsWith(ADMIN_PFX) && isAdmin) {
        const cmd = msg.substring(ADMIN_PFX.length).trim();
        if (cmd === "listload") {
            replier.reply("데이터 로드 중...");
            replier.reply(loadHeavyWords());
        } else if (cmd.startsWith("addword ")) {
            if (!WORD_SET) { replier.reply("로드 필요"); return; }
            let word = cmd.replace("addword ", "").trim();
            if (word.length < 2) return;
            if (!WORD_SET.has(word)) {
                WORD_SET.add(word);
                WORD_LIST.push(word);
                let first = word[0];
                if (!WORDS_BY_START[first]) WORDS_BY_START[first] = [];
                WORDS_BY_START[first].push(word);
            }
            replier.reply("단어 추가: " + word);
        } else if (cmd.startsWith("normalFPX ")) {
            PREFIX = cmd.replace("normalFPX ", "").trim();
            replier.reply(PREFIX);
        } else if (cmd.startsWith("inputFPX ")) {
            INPUT_PFX = cmd.replace("inputFPX ", "").trim();
            replier.reply(INPUT_PFX);
        } else if (cmd.startsWith("nextw ")) {
            let rerew = cmd.replace("nextw ", "");
            if (rerew.length > 1) return;
            if (!game) { replier.reply("empty room"); return; }
            nextw = rerew;
        }
        return;
    }

    // --- 상태 확인 ---
    if (msg === PREFIX + "상태" || msg === PREFIX + "ㅅㅌ") {
        if (!game || !game.started) { replier.reply("진행 중인 게임 없음"); return; }
        if (game.phase !== "playing") { replier.reply("현재 대기 혹은 직업 선택 중입니다."); return; }

        replier.reply(buildStatusMsg(game)); return;
    }

    // --- 직업 목록 ---
    if (msg === PREFIX + "직업목록" || msg === PREFIX + "ㅈㅇ") {
        let jobs = getSelectableJobs(game, sender);
        let title = (game && game.phase === "job_selection" && sender !== game.firstPicker && game.bannedJobs.length > 0) ? "[ 선택 가능 직업 목록 ]" : "[ 전체 직업 목록 ]";
        let listMsg = title + "\n\n";
        if (game && game.phase === "job_selection") {
            listMsg += "현재 확인 가능한 직업 수: " + jobs.length + "개\n";
            if (game.bannedJobs.length > 0) listMsg += "밴된 직업: " + game.bannedJobs.join(", ") + "\n";
        } else {
            listMsg += "등록 직업 수: " + jobs.length + "개\n";
        }
        listMsg += "\n" + jobs.join(", ");
        replier.reply(foldByVisibleLines(listMsg, 2));
        return;
    }

    // --- 직업 정보 조회 ---
    if (msg === PREFIX + "직업정보" || msg === PREFIX + "직업선택" || msg === PREFIX + "ㅈㅂ") {
        replier.reply("사용법: " + PREFIX + "ㅈㅂ [직업명]");
        return;
    }
    if (msg.startsWith(PREFIX + "직업정보 ") || msg.startsWith(PREFIX + "직업선택 ") || msg.startsWith(PREFIX + "ㅈㅂ ")) {
        let jobName = msg
            .replace(new RegExp("^" + PREFIX + "직업정보\\s+"), "")
            .replace(new RegExp("^" + PREFIX + "직업선택\\s+"), "")
            .replace(new RegExp("^" + PREFIX + "ㅈㅂ\\s+"), "")
            .trim();
        jobName = normalizeJobName(jobName);
        if (JOB_INFO[jobName]) {
            replier.reply(foldByVisibleLines(JOB_INFO[jobName], 4));
        } else {
            replier.reply(foldByVisibleLines("[ 직업 정보 없음 ]\n\n\"" + jobName + "\" 직업을 찾을 수 없습니다.\n사용 가능한 직업: " + ALL_JOBS.join(", "), 2));
        }
        return;
    }

    // --- 직업 랜덤 고르기 ---
    if (msg === PREFIX + "직업랜덤" || msg === PREFIX + "직업랜덤고르기" || msg === PREFIX + "ㅈㅅㄹㄷ") {
        if (game && game.phase === "job_selection" && game.players.includes(sender)) {
            if (game.playerStates[sender]) {
                replier.reply("이미 직업을 선택하셨습니다.");
                return;
            }
            let selectableJobs = getSelectableJobs(game, sender);
            if (selectableJobs.length === 0) {
                replier.reply("선택 가능한 직업이 없습니다.");
                return;
            }
            let randomJob = selectableJobs[Math.floor(Math.random() * selectableJobs.length)];
            handleJobSelection(game, sender, randomJob, replier, true);
            return;
        }

        let randomJob = ALL_JOBS[Math.floor(Math.random() * ALL_JOBS.length)];
        replier.reply(foldByVisibleLines("[ 랜덤 직업 ]\n\n추천 직업: " + randomJob + "\n직업 정보: " + PREFIX + "ㅈㅂ " + randomJob + "\n직업 선택: " + PREFIX + "ㅈㅅ " + randomJob, 2));
        return;
    }


    // --- 게임 참가 및 시작 ---
    if (msg === PREFIX + "채린" || msg === PREFIX + "ㅊㄹ") {
        if (!WORD_SET) { replier.reply("단어 로드 필요 (.dev listload)"); return; }
        if (!games[room]) {
            games[room] = {
                phase: "waiting", players: [], started: false, used: new Set(), history: [],
                turnCount: 1, currentTurnIndex: -1, firstTurnIndex: -1,
                lastLetter: { s1: "", s2: "" },
                isWaitingVote: false, voteType: null, targetWord: null, requester: null,
                lastPlayTime: Date.now(),
                kickVote: { target: null, startTime: null },
                playerStates: {},
                bannedJobs: [], firstPicker: null, banPhase: false
            };
            game = games[room];
        }

        if (game.started || game.players.includes(sender) || game.players.length >= 2) return;
        game.players.push(sender);
        replySystem(replier, sender + "이 참가했다. 현재 " + game.players.length + "명이다.");

        if (game.players.length === 2) {
            game.phase = "job_selection";
            game.started = true;
            replier.reply(joinFoldedLines([
                systemLine("참가 인원이 모였다. 직업을 선택해 달라."),
                systemLine("입력 예시: " + PREFIX + "ㅈㅅ 해커")
            ], [
                systemLine("직업 정보 보기: " + PREFIX + "ㅈㅂ 해커"),
                systemLine("직업 랜덤 고르기: " + PREFIX + "ㅈㅅㄹㄷ"),
                systemLine("직업 목록: " + PREFIX + "ㅈㅇ"),
                systemLine("현재 등록 직업 수는 " + ALL_JOBS.length + "개다.")
            ]));
        }
        return;
    }

    // --- 밴픽 (1밴 직업1 직업2 ... 최대 6개, 한 번에 처리) ---
    if ((msg.startsWith(PREFIX + "밴 ") || msg === PREFIX + "밴") && game && game.phase === "job_selection" && game.banPhase) {
        if (sender !== game.firstPicker) { replySystem(replier, "밴 권한은 먼저 직업을 선택한 사람에게 있다."); return; }

        let banList = msg.slice(PREFIX.length + 1).trim().split(/\s+/).filter(function (j) { return j.length > 0; });
        let myJob = game.playerStates[sender].job;
        let errors = [];
        let added = [];

        for (let banJob of banList) {
            if (added.length >= 6) { errors.push("최대 6개까지만 밴 가능 (이후 무시됨)"); break; }
            if (!ALL_JOBS.includes(banJob)) { errors.push("없는 직업: " + banJob); continue; }
            if (added.includes(banJob)) { errors.push("중복: " + banJob); continue; }
            added.push(banJob);
        }

        game.bannedJobs = added;
        game.banPhase = false;
        let otherPlayer = game.players.find(function (p) { return p !== sender; });
        let bannedStr = added.length > 0 ? "[" + added.join(", ") + "]" : "없음";
        let availStr = ALL_JOBS.filter(function (j) { return !added.includes(j); }).join(", ");
        let replyLines = [
            systemLine("밴 선택이 완료됐다."),
            systemLine("밴된 직업: " + bannedStr)
        ];
        if (errors.length > 0) replyLines.push(systemLine("처리 중 제외된 항목: " + errors.join(" / ")));
        replyLines.push(systemLine(otherPlayer + "은 이제 직업을 선택하면 된다."));
        replier.reply(joinFoldedLines(replyLines, [
            systemLine("선택 가능 직업: [" + availStr + "]")
        ]));
        return;
    }

    // --- 직업 선택 ---
    if (msg === PREFIX + "직업" || msg === PREFIX + "ㅈㅅ") {
        replier.reply("사용법: " + PREFIX + "ㅈㅅ [직업명]");
        return;
    }
    if (msg.startsWith(PREFIX + "직업 ") || msg.startsWith(PREFIX + "ㅈㅅ ")) {
        if (!game || game.phase !== "job_selection") {
            replier.reply("현재 직업 선택 중이 아닙니다.");
            return;
        }
        let job = msg.replace(PREFIX + "직업 ", "").replace(PREFIX + "ㅈㅅ ", "").trim();
        handleJobSelection(game, sender, job, replier, false);
        return;
    }

    // --- 종료 및 최종 기보 ---
    if (msg === "ㅈㅈ") {
        if (!game || !game.players.includes(sender)) return;
        if (game.phase === "playing" || game.phase === "job_selection") {
            let winner = game.players.find(function (p) { return p !== sender; });
            replier.reply(joinLines([
                systemLine(sender + "이 기권해 경기가 끝난다."),
                systemLine("승자는 " + winner + "이다."),
                systemLine("기보: " + (game.history.length > 0 ? game.history.join(" ") : "없음"))
            ]));
            finishTierGame(room, winner, "기권", replier);
        } else {
            replySystem(replier, "게임 대기가 취소된다.");
        }
        if (game.phase !== "playing") clearTierGame(room);
        delete games[room];
    }

    // --- 능력 사용 (2능력명) ---
    if (msg.startsWith("2") && msg.length > 1) {
        if (!game || game.phase !== "playing" || !game.players.includes(sender)) return;
        let abilityStr = msg.substring(1).trim();
        let abilityWords = abilityStr.split(" ");
        let ability = abilityWords[0];
        if (abilityWords.length > 1 && (ability === "주가" || ability === "거짓" || ability === "시적" || ability === "꼬리" || ability === "사형" || ability === "긴급" || ability === "허들" || ability === "강도")) {
            ability = abilityWords[0] + " " + abilityWords[1]; // 두 어절 스킬 이름 처리
            abilityWords.shift();
        }
        let targetParam = abilityWords.length > 1 ? abilityWords.slice(1).join(" ") : null;

        let state = game.playerStates[sender];
        let isAbilityDisabled = state.disabled_turns > 0 || state.lost_abilities || state.absolutely_disabled > 0;
        let oppIndex = (game.players.indexOf(sender) + 1) % 2;
        let oppState = game.playerStates[game.players[oppIndex]];

        if (state.destroyed_active_abilities && state.destroyed_active_abilities.includes(ability)) {
            replier.reply("파괴된 능력이라 사용할 수 없습니다.");
            return;
        }

        if (state.absolutely_disabled > 0 && state.job !== "고죠") {
            replier.reply("영역 전개 [무량공처]의 영향으로 능력을 사용할 수 없습니다.");
            return;
        }

        if (state.job === "해커") {
            if (ability === "조작" && !isAbilityDisabled) {
                if (state.jojak_uses >= 3) { replier.reply("조작 능력을 모두 사용했습니다."); return; }
                if (state.jojak_cooldown > 0) { replier.reply("조작 쿨타임입니다. (" + state.jojak_cooldown + "턴 남음)"); return; }
                state.jojak_uses += 1; state.jojak_cooldown = 4; state.jojak_active = 2;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "조작", "기록을 비튼다.") + " 2턴 동안 이미 사용한 단어를 다시 사용할 수 있다.");
            } else if (ability === "복제" && !isAbilityDisabled) {
                if (game.turnCount < 7) { replier.reply("복제 능력은 7턴 이후부터 사용할 수 있습니다."); return; }
                if (state.bokje_uses >= 1) { replier.reply("복제 능력을 모두 사용했습니다."); return; }
                state.bokje_uses += 1;
                let myDebuffs = {
                    disabled_turns: state.disabled_turns, no_yudo_turns: state.no_yudo_turns, no_hanbang_turns: state.no_hanbang_turns,
                    no_du_eum_turns: state.no_du_eum_turns, only_even_turns: state.only_even_turns, only_odd_turns: state.only_odd_turns,
                    only_length_2_turns: state.only_length_2_turns, no_length_2_turns: state.no_length_2_turns,
                    only_root_turns: state.only_root_turns, last_route_only_turns: state.last_route_only_turns, limited_length: state.limited_length, target_active_turns: state.target_active_turns
                };
                Object.assign(oppState, myDebuffs);
                Object.keys(myDebuffs).forEach(function (k) { state[k] = 0; });
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "복제", "제약을 복제한다.") + " 내 디버프를 지우고 상대에게 넘긴다.");
            } else if (ability === "초토화" && !isAbilityDisabled) {
                if (game.turnCount < 7) { replier.reply("초토화 능력은 7턴 이후부터 사용할 수 있습니다."); return; }
                if (state.chotohwa_uses >= 2) { replier.reply("초토화 능력을 모두 사용했습니다."); return; }
                if (state.chotohwa_cooldown > 0) { replier.reply("초토화 쿨타임입니다. (" + state.chotohwa_cooldown + "턴 남음)"); return; }
                state.chotohwa_uses += 1; state.chotohwa_cooldown = 7; state.chotohwa_active = 1;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "초토화", "초토화를 준비한다.") + " 다음 상대 행동을 노린다.");
            }
        }
        else if (state.job === "투자자" && !isAbilityDisabled) {
            if (ability === "주가 조작") {
                if (state.juga_jojak_uses >= 2) { replier.reply("주가 조작를 모두 사용했습니다."); return; }
                if (state.juga_jojak_cooldown > 0) { replier.reply("주가 조작 쿨타임입니다."); return; }
                state.juga_jojak_uses += 1; state.juga_jojak_cooldown = 7; state.juga_jojak_active = true;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "주가 조작", "주가를 흔든다.") + " 다음 변동은 무조건 하락으로 계산된다.");
            }
        }
        else if (state.job === "수집가" && !isAbilityDisabled) {
            if (ability === "제작") {
                if (!targetParam || targetParam.length < 2) { replier.reply("2글자 이상의 추가단어를 지정해야 합니다."); return; }
                if (state.make_cooldown > 0) { replier.reply("제작 쿨타임입니다."); return; }
                // 음절 소모 가능여부 (간소화 버젼: 보유한 배열에서 뺌)
                let tempSyllables = state.collected_syllables.slice();
                let possible = true;
                for (let ch of targetParam) {
                    let idx = tempSyllables.indexOf(ch);
                    if (idx > -1) tempSyllables.splice(idx, 1);
                    else { possible = false; break; }
                }
                if (!possible) { replier.reply("해당 단어를 제작하기 위한 수집 한글 음절이 부족합니다."); return; }
                state.collected_syllables = tempSyllables;
                state.make_cooldown = 6;
                if (!game.customWords) game.customWords = new Set();
                game.customWords.add(targetParam);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "제작", "새 단어를 만든다.") + " 이제 " + targetParam + "를 사용할 수 있다.");
            } else if (ability === "채굴") {
                if (state.mine_uses >= 2) { replier.reply("채굴을 모두 사용했습니다."); return; }
                if (state.mine_cooldown > 0) { replier.reply("채굴 쿨타임입니다."); return; }
                state.mine_uses++; state.mine_cooldown = 6; state.mine_active = 1;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "채굴", "더 깊게 파고든다.") + " 이번 턴에는 상대 단어의 모든 음절을 수집한다.");
            }
        }
        else if (state.job === "환자") {
            if (ability === "환각증" && !isAbilityDisabled) {
                if (game.turnCount < 7) { replier.reply("환각증 능력은 7턴 이후부터 사용할 수 있습니다."); return; }
                if (state.hallucination_uses >= 1) { replier.reply("환각증을 모두 사용했습니다."); return; }
                if (game.history.length > 0 && !isRoot(game.history[game.history.length - 1])) {
                    replier.reply("환각증은 루트단어를 받았을 때만 사용할 수 있습니다."); return;
                }
                state.hallucination_uses++;
                state.patient_no_kill_turns = 2; // 전투 후 본인 디버프
                state.limited_length = 3;
                oppState.hallucination_active = true;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "환각증", "환각을 건다.") + " 상대는 1턴 동안 앞말잇기를 해야 한다.");
            }
        }
        else if (state.job === "감시자" && !isAbilityDisabled) {
            if (ability === "탐지") {
                if (state.detect_uses >= 2) { replier.reply("탐지를 모두 사용했습니다."); return; }
                if (state.detect_cooldown > 0) { replier.reply("탐지 쿨타임입니다."); return; }
                state.detect_uses++; state.detect_cooldown = 6;
                state.detect_active_turns = 1;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "탐지", "탐지를 건다.") + " 다음 감시 차감은 2배가 된다.");
            }
        }
        else if (state.job === "뜀틀선수" && !isAbilityDisabled) {
            if (ability === "허들 넘기") {
                if (game.turnCount < 22) { replier.reply("허들 넘기는 22턴 이상부터 사용 가능합니다."); return; }
                if (state.hurdle_uses >= 1) { replier.reply("허들 넘기 능력을 모두 사용했습니다."); return; }
                state.hurdle_uses++;
                state.vault_max++; state.vault_cooldown = 0;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "허들 넘기", "한 번 더 뛴다.") + " 뜀틀 기회가 1회 늘고 쿨타임이 초기화된다.");
            }
        }
        else if (state.job === "전우치" && !isAbilityDisabled) {
            if (ability === "직격뢰") {
                if (state.lightning_uses >= 4) { replier.reply("직격뢰 능력을 모두 사용했습니다."); return; }
                if (state.lightning_cooldown > 0) { replier.reply("직격뢰 쿨타임입니다."); return; }
                if (!targetParam) { replier.reply("대상을 지정해주세요."); return; }
                state.lightning_uses++; state.lightning_cooldown = 7;
                // 금지풀에 넣음
                if (!game.bannedWords) game.bannedWords = new Set();
                game.bannedWords.add(targetParam);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "직격뢰", "직격뢰를 떨어뜨린다.") + " " + targetParam + "는 더 이상 사용할 수 없다.");
            }
        }
        else if (state.job === "시프터" && !isAbilityDisabled) {
            if (ability === "시프트") {
                if (state.shift_uses >= 3) { replier.reply("시프트를 모두 사용했습니다."); return; }
                const vowelSeq = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
                let decom = decomposeSyllable(game.lastLetter.s2);
                if (!decom) { replier.reply("분해 불가"); return; }
                let curIdx = vowelSeq.indexOf(decom.jungsung);
                if (curIdx === -1 || curIdx === vowelSeq.length - 1) { replier.reply("더 넘길 모음이 없습니다."); return; }
                decom.jungsung = vowelSeq[curIdx + 1];
                let nextList = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
                let newChar = composeSyllable(decom.ci, nextList.indexOf(decom.jungsung), decom.gi);
                game.lastLetter.s1 = newChar; // 두음 미적용
                game.lastLetter.s2 = newChar;
                state.shift_uses++;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "시프트", "모음을 민다.") + " 이을 음절이 " + newChar + "로 바뀐다.");
            }
        }
        else if (state.job === "비밀요원" && !isAbilityDisabled) {
            if (ability === "포획") {
                // target Param (음절)
                if (state.capture_uses >= 2) { replier.reply("포획을 모두 사용했습니다."); return; }
                if (state.capture_cooldown > 0) { replier.reply("포획 쿨타임입니다."); return; }
                if (!targetParam || targetParam.length !== 1) { replier.reply("포획할 대상 은 1음절이어야 합니다."); return; }
                // 포획 실행 (시뮬레이션 구현상 대상 음절 지정)
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 2);
                state.capture_uses++; state.capture_cooldown = 3;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "포획", "포획을 마친다.") + " " + targetParam + " 시작 단어 일부가 사라지고 상대는 2턴 동안 패시브와 능력을 쓸 수 없다.");
            }
        }
        else if (state.job === "사과" && !isAbilityDisabled) {
            if (ability === "사구아") {
                if (state.sagua_uses >= 1) { replier.reply("사구아 능력을 모두 사용했습니다."); return; }
                state.sagua_uses++;
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 3);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "사구아", "강한 봉인을 남긴다.") + " 상대는 3턴 동안 패시브와 능력을 쓸 수 없다.");
            }
        }
        else if (state.job === "시인" && !isAbilityDisabled) {
            if (ability === "2음절") {
                if (state.poetic_2_uses >= 3) { replier.reply("2음절 능력을 모두 사용했습니다."); return; }
                if (state.poetic_2_cooldown > 0) { replier.reply("2음절 쿨타임입니다."); return; }
                state.poetic_2_uses++; state.poetic_2_cooldown = 2;
                oppState.only_length_2_turns = Math.max(oppState.only_length_2_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "2음절", "운율을 두 글자로 고정한다.") + " 상대는 1턴 동안 2글자 단어만 사용할 수 있다.");
            } else if (ability === "시적 허용") {
                if (state.poetic_allow_uses >= 2) { replier.reply("시적 허용 능력을 모두 사용했습니다."); return; }
                if (state.poetic_allow_cooldown > 0) { replier.reply("시적 허용 쿨타임입니다."); return; }
                state.poetic_allow_uses++; state.poetic_allow_cooldown = 3;
                oppState.no_du_eum_turns = Math.max(oppState.no_du_eum_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "시적 허용", "두음의 흐름을 끊는다.") + " 상대는 1턴 동안 두음법칙을 쓸 수 없다.");
            }
        }
        else if (state.job === "공룡" && !isAbilityDisabled) {
            if (ability === "삼키기") {
                if (state.swallow_uses >= 2) { replier.reply("삼키기를 모두 사용했습니다."); return; }
                if (state.swallow_cooldown > 0) { replier.reply("삼키기 쿨타임입니다."); return; }
                if (game.history.length < 2) { replier.reply("이전 단어가 부족합니다."); return; }
                let swallowed = game.history.pop();
                game.used.delete(swallowed); // 삼킨 단어는 재사용 가능
                let lastValid = game.history[game.history.length - 1];
                let last = lastValid[lastValid.length - 1];
                game.lastLetter.s1 = applyDuEum(last); game.lastLetter.s2 = last;
                state.swallow_uses++; state.swallow_cooldown = 7; state.dino_swallowed = true;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "삼키기", "방금 단어를 삼킨다.") + " " + swallowed + "가 사라지고 " + lastValid + " 기준으로 되돌아간다. 이번 직후에는 3글자 이하 일반단어만 가능하다.");
            } else if (ability === "브레스") {
                if (game.turnCount < 10) { replier.reply("10턴부터 사용 가능합니다."); return; }
                if (state.breath_uses >= 1) { replier.reply("브레스를 모두 사용했습니다."); return; }
                state.breath_uses++;
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "브레스", "브레스를 뿜는다.") + " 상대는 1턴 동안 유도단어를 쓸 수 없다.");
            } else if (ability === "꼬리 날리기") {
                if (game.turnCount < 13) { replier.reply("13턴부터 사용 가능합니다."); return; }
                if (state.tail_uses >= 1) { replier.reply("꼬리 날리기를 모두 사용했습니다."); return; }
                state.tail_uses++; state.tail_active = true;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "꼬리 날리기", "꼬리를 휘둘러 제약을 털어낸다.") + " 다음 턴에는 능력 불가를 무시한다.");
            }
        }
        else if (state.job === "마법사" && !isAbilityDisabled) {
            if (ability === "공허") {
                if (state.void_uses >= 5) { replier.reply("공허를 모두 사용했습니다."); return; }
                if (state.void_cooldown > 0) { replier.reply("공허 쿨타임입니다."); return; }
                let decom = decomposeSyllable(game.lastLetter.s2);
                if (decom && decom.gi > 0) {
                    let newChar = composeSyllable(decom.ci, decom.ji, 0);
                    game.lastLetter.s2 = newChar;
                    game.lastLetter.s1 = applyDuEum(newChar);
                    state.void_uses++; state.void_cooldown = 4;
                    replyJob(replier, state.job, getJobDialogue(state.job, "active", "공허", "끝음절을 비운다.") + " 종성이 지워져 " + newChar + "로 바뀐다.");
                } else {
                    replier.reply("종성이 없는 음절입니다.");
                }
            } else if (ability === "폭발") {
                if (game.turnCount < 14) { replier.reply("14턴 이상 시 사용."); return; }
                if (state.explosion_uses >= 1) { replier.reply("모두 사용."); return; }
                state.disabled_turns = 0; state.no_yudo_turns = 0; state.no_hanbang_turns = 0; state.no_du_eum_turns = 0;
                state.only_even_turns = 0; state.only_odd_turns = 0; state.only_length_2_turns = 0; state.no_length_2_turns = 0;
                state.only_root_turns = 0; state.last_route_only_turns = 0; state.limited_length = 0; state.target_active_turns = 0;
                state.knight_lock_turns = 0; state.knight_silence_turns = 0;
                state.explosion_uses++;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "폭발", "폭발로 제약을 쓸어낸다.") + " 모든 디버프가 제거된다.");
            }
        }
        else if (state.job === "사신" && !isAbilityDisabled) {
            if (ability === "사형 선고") {
                if (state.death_uses >= 4444) return;
                if (state.death_cooldown > 0) { replier.reply("쿨타임입니다."); return; }
                state.death_uses++; state.death_cooldown = 4;
                if (state.execution_count <= 4) {
                    replier.reply(joinLines([
                        jobLine(state.job, getJobDialogue(state.job, "active", "사형 선고", "선고를 내린다.") + " 남은 처형 수가 바닥났다."),
                        systemLine(sender + "의 승리로 경기가 끝난다.")
                    ]));
                    finishTierGame(room, sender, "사형 선고", replier);
                    delete games[room]; return;
                } else if (state.execution_count <= 18) {
                    // "4글자 이하인 단어를 사용할 수 없음" = 5글자 이상만 허용 → min_length = 5
                    oppState.min_length = Math.max(oppState.min_length || 0, 5);
                    replyJob(replier, state.job, getJobDialogue(state.job, "active", "사형 선고", "선고를 내린다.") + " 상대는 1턴 동안 5글자 이상의 단어만 사용할 수 있다.");
                }
            }
        }
        else if (state.job === "수학자") {
            // abilities can be used even if disabled? No.
            if (isAbilityDisabled) return;
            state.used_active_this_turn = true;
            if (ability === "계산") {
                if (state.calc_uses >= 2) return;
                if (state.calc_cooldown > 0) return;
                state.calc_uses++; state.calc_cooldown = 1;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "계산", "결과를 확인한다.") + " 현재 결과 수는 " + state.math_result + "다.");
                if (state.math_result === 20) {
                    replySystem(replier, sender + "의 계산이 완성되어 경기가 끝난다.");
                    finishTierGame(room, sender, "계산", replier);
                    delete games[room]; return;
                }
            } else if (ability === "덧셈") {
                if (state.add_uses >= 3) return;
                if (state.add_cooldown > 0) return;
                if (game.history.length > 0) state.math_result += game.history[game.history.length - 1].length;
                state.add_uses++; state.add_cooldown = 2;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "덧셈", "덧셈을 적용한다."));
            } else if (ability === "뺄셈") {
                if (state.sub_uses >= 2) return;
                if (game.history.length > 0) state.math_result -= game.history[game.history.length - 1].length;
                state.sub_uses++;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "뺄셈", "뺄셈을 적용한다."));
            } else if (ability === "곱셈") {
                if (state.mul_uses >= 1) return;
                if (game.history.length > 0) state.math_result *= game.history[game.history.length - 1].length;
                state.mul_uses++;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "곱셈", "곱셈을 적용한다."));
            } else if (ability === "교정") {
                if (state.correct_uses >= 2) return;
                if (state.correct_cooldown > 0) return;
                state.math_result += 1;
                state.correct_uses++; state.correct_cooldown = 4;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "교정", "교정을 적용한다."));
            } else if (ability === "미적분") {
                if (state.calculus_uses >= 1) return;
                state.calculus_uses++;
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "미적분", "미적분을 적용한다.") + " 상대 능력은 1턴 동안 멈춘다.");
            }
        }
        else if (state.job === "과학자" && !isAbilityDisabled) {
            if (ability === "DNA파괴") {
                if (state.dna_uses >= 2) { replier.reply("DNA파괴를 모두 사용했습니다."); return; }
                if (state.dna_cooldown > 0) { replier.reply("DNA파괴 쿨타임입니다."); return; }
                if (!targetParam) { replier.reply("파괴할 상대 액티브 능력을 지정해주세요."); return; }
                let targetAbility = targetParam.trim();
                let activeAbilities = getActiveAbilityNames(oppState.job);
                if (!activeAbilities.includes(targetAbility)) {
                    replier.reply("상대 직업의 액티브 능력이 아닙니다. 가능 대상: " + (activeAbilities.length > 0 ? activeAbilities.join(", ") : "없음"));
                    return;
                }
                if (oppState.destroyed_active_abilities && oppState.destroyed_active_abilities.includes(targetAbility)) {
                    replier.reply("이미 파괴된 능력입니다.");
                    return;
                }
                state.dna_uses++;
                state.dna_cooldown = 8;
                state.dna_target = targetAbility;
                state.dna_tracking = true;
                state.dna_success_streak = 0;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "DNA파괴", "표적 능력을 정하고 연속 실험을 준비한다.") + " 표적은 " + targetAbility + "다.");
            } else if (ability === "도전") {
                if (state.challenge_uses >= 1) { replier.reply("도전은 이미 사용했습니다."); return; }
                if (state.experiment_success_total < 15) { replier.reply("실험 15회 이상 성공해야 사용할 수 있습니다."); return; }
                state.challenge_uses++;
                state.challenge_active = true;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "도전", "금지된 영역까지 연구 범위를 넓힌다.") + " 이제 사전에 없는 단어도 사용할 수 있다.");
            }
        }
        else if (state.job === "스폰지밥" && !isAbilityDisabled) {
            if (ability === "게살버거") {
                let burgerPrice = getSpongebobFoodPrice(state, "게살버거");
                if (state.burger_cooldown > 0) { replier.reply("게살버거 쿨타임입니다."); return; }
                if (state.money < burgerPrice) { replier.reply("돈이 부족합니다. (현재 " + state.money + "원 / 필요 " + burgerPrice + "원)"); return; }
                state.money -= burgerPrice;
                state.burger_cooldown = 1;
                oppState.no_hanbang_turns = Math.max(oppState.no_hanbang_turns, 1);
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "게살버거", "게살버거로 상대의 공격단어를 막아 둔다.") + " " + burgerPrice + "원을 쓰고 상대의 공격단어를 1턴 동안 막는다.");
            } else if (ability === "감자튀김") {
                let friesPrice = getSpongebobFoodPrice(state, "감자튀김");
                if (state.fries_cooldown > 0) { replier.reply("감자튀김 쿨타임입니다."); return; }
                if (state.money < friesPrice) { replier.reply("돈이 부족합니다. (현재 " + state.money + "원 / 필요 " + friesPrice + "원)"); return; }
                state.money -= friesPrice;
                state.fries_cooldown = 1;
                oppState.only_even_turns = Math.max(oppState.only_even_turns, 2);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "감자튀김", "바삭한 제약으로 짝수 길이만 강요한다.") + " " + friesPrice + "원을 쓰고 상대를 2턴 동안 짝수 글자 단어에 묶는다.");
            } else if (ability === "보너스") {
                if (state.bonus_uses >= 4) { replier.reply("보너스를 모두 사용했습니다."); return; }
                if (state.bonus_cooldown > 0) { replier.reply("보너스 쿨타임입니다."); return; }
                state.bonus_uses++;
                state.bonus_cooldown = 3;
                state.bonus_active = true;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "보너스", "다음 수익을 두 배로 불린다.") + " 다음에 들어오는 돈은 2배가 된다.");
            } else if (ability === "강도 채용") {
                if (state.robber_uses >= 3) { replier.reply("강도 채용을 모두 사용했습니다."); return; }
                if (state.robber_cooldown > 0) { replier.reply("강도 채용 쿨타임입니다."); return; }
                if (state.money < 30000) { replier.reply("돈이 부족합니다. (현재 " + state.money + "원 / 필요 30000원)"); return; }
                state.money -= 30000;
                state.robber_uses++;
                state.robber_cooldown = 5;
                state.robber_turns = 2;
                state.robber_skip_current = true;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "강도 채용", "위험을 감수하고 은행 습격 수익을 굴린다.") + " 다음부터 2턴 동안 5000원씩 들어오지만, 그동안 현상수배 상태가 된다.");
            }
        }
        else if (state.job === "나이트" && !isAbilityDisabled) {
            if (ability === "체크메이트") {
                if (state.checkmate_uses >= 5) { replier.reply("체크메이트를 모두 사용했습니다."); return; }
                if (state.checkmate_cooldown > 0) { replier.reply("체크메이트 쿨타임입니다."); return; }
                state.checkmate_uses++;
                state.checkmate_cooldown = 4;
                oppState.no_du_eum_turns = Math.max(oppState.no_du_eum_turns, 1);
                oppState.only_root_turns = Math.max(oppState.only_root_turns, 2);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "체크메이트", "루트만 남기는 압박으로 상대 수를 막는다.") + " 상대는 1턴 동안 두음법칙을 쓸 수 없고 2턴 동안 루트단어만 사용할 수 있다.");
            } else if (ability === "교환") {
                if (state.exchange_uses >= 1) { replier.reply("교환은 이미 사용했습니다."); return; }
                state.exchange_uses++;
                state.exchange_pending = true;
                state.exchange_active = false;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "교환", "다음 차례에는 아무 루트단어로 말을 바꿔 탄다.") + " 상대 턴이 지나면 다음 차례에 아무 루트단어를 중복과 무관하게 사용할 수 있다.");
            } else if (ability === "울음") {
                if (state.cry_uses >= 1) { replier.reply("울음은 이미 사용했습니다."); return; }
                state.cry_uses++;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "울음", "히힝 하고 울어 본다.") + " 기능은 없다.");
            }
        }
        else if (state.job === "작곡가" && !isAbilityDisabled) {
            if (ability === "쪼개기") {
                if (state.split_uses >= 3) { replier.reply("쪼개기를 모두 사용했습니다."); return; }
                state.split_uses++;
                state.split_pending = true;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "쪼개기", "다음 음표를 더 잘게 쪼갤 준비를 한다.") + " 다음 작곡 패시브 발동 때 음표가 한 단계 더 잘게 쪼개진다.");
            } else if (ability === "쉼표") {
                if (state.rest_cooldown > 0) { replier.reply("쉼표 쿨타임입니다."); return; }
                if (state.compose_units <= 0) { replier.reply("현재 진행 중인 마디가 없습니다."); return; }
                state.rest_cooldown = 3;
                state.compose_units = 0;
                state.compose_target_units = 8;
                state.compose_notes = [];
                oppState.no_hanbang_turns = Math.max(oppState.no_hanbang_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "쉼표", "남은 박자를 쉼표로 채워 마디를 닫는다.") + " 현재 마디가 즉시 완성되지만 작곡 효과는 발동하지 않는다. 상대는 1턴 동안 한방단어를 사용할 수 없다.");
            }
        }
        else if (state.job === "생존자" && !isAbilityDisabled) {
            if (ability === "긴급 구조") {
                if (state.rescue_uses >= 2) return;
                if (state.rescue_cooldown > 0) return;
                if (!isRoot(game.history[game.history.length - 1]) && !isYudo(game.history[game.history.length - 1])) return;
                // rule: [A, B, C, D, E] -> remove A,B. [C,D,E] -> reverse to [E,D,C] but reverse string. Actually user said "기보에 추가가 아닌 바뀌는 것입니다. 기차 차표 표범 범죄 죄인 -> 인죄 죄범 범표"
                let newHist = [];
                for (let i = game.history.length - 1; i >= 2; i--) {
                    let w = game.history[i];
                    newHist.push(w.split('').reverse().join('')); // 인죄 죄범 범표
                }
                game.history = newHist;
                let lastValid = game.history[game.history.length - 1];
                let last = lastValid[lastValid.length - 1];
                game.lastLetter.s1 = applyDuEum(last); game.lastLetter.s2 = last;

                state.rescue_uses++; state.rescue_cooldown = 7;
                state.rescue_no_kill_turns = 1;
                state.disabled_turns = 0; state.no_yudo_turns = 0; state.no_hanbang_turns = 0; state.no_du_eum_turns = 0;
                state.no_length_2_turns = 0; state.only_root_turns = 0; state.last_route_only_turns = 0; state.knight_lock_turns = 0; state.knight_silence_turns = 0;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "긴급 구조", "구조 신호를 보낸다.") + " 기보가 뒤집히고 마지막 단어는 " + lastValid + "가 된다.");
            }
        }
        else if (state.job === "악당" && !isAbilityDisabled) {
            if (ability === "결계") {
                if (state.barrier_uses >= 4) return;
                if (state.barrier_cooldown > 0) return;
                let dur = game.history.length > 0 ? game.history[game.history.length - 1].length : 2;
                state.barrier_uses++; state.barrier_cooldown = 5;
                state.barrier_turns = dur;
                state.barrier_chosungs = ["ㄱ", "ㄴ"];
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "결계", "결계를 펼친다.") + " " + dur + "턴 동안 유지된다.");
            } else if (ability === "왜곡") {
                if (state.distort_uses >= 2 || state.barrier_turns === 0) return;
                if (state.distort_cooldown > 0) return;
                state.distort_uses++; state.distort_cooldown = 1;
                let dict = { "ㄱ": "ㅎ", "ㄴ": "ㅍ", "ㄷ": "ㅌ", "ㄹ": "ㅋ" }; // 간단 매핑, 나머지는 무시
                for (let i = 0; i < state.barrier_chosungs.length; i++) {
                    if (dict[state.barrier_chosungs[i]]) state.barrier_chosungs[i] = dict[state.barrier_chosungs[i]];
                }
                if (state.barrier_chosungs.length >= 4) oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "왜곡", "결계를 왜곡한다."));
            }
        }
        else if (state.job === "기자" && !isAbilityDisabled) {
            if (ability === "거짓 보도") {
                if (state.report_uses >= 4) return;
                if (state.report_cooldown > 0) return;
                state.report_uses++; state.report_cooldown = 3; state.report_turns = 1;
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                oppState.no_du_eum_turns = Math.max(oppState.no_du_eum_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "거짓 보도", "거짓 보도를 내보낸다.") + " 1턴 동안 보도가 유지된다.");
            }
        }
        else if (state.job === "검객" && !isAbilityDisabled) {
            if (ability === "찌르기") {
                if (game.turnCount < 5) return;
                if (state.stab_uses >= 2) return;
                if (state.stab_cooldown > 0) return;
                state.stab_uses++; state.stab_cooldown = 5;
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                oppState.no_du_eum_turns = Math.max(oppState.no_du_eum_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "찌르기", "짧고 깊게 찌른다."));
            } else if (ability === "가르기") {
                if (state.slice_uses >= 3 || state.slice_cooldown > 0) return;
                if (game.history.length === 0) return;
                let lastw = game.history[game.history.length - 1];
                let decom = decomposeSyllable(lastw[lastw.length - 1]);
                if (decom.gi > 0) {
                    game.lastLetter.s2 = composeSyllable(decom.ci, 0, decom.gi);
                } else {
                    game.lastLetter.s2 = composeSyllable(decom.ci, decom.ji, 0);
                }
                game.lastLetter.s1 = game.lastLetter.s2;
                state.slice_uses++; state.slice_cooldown = 3;
                if (game.turnCount < 12) state.slice_active = true;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "가르기", "받은 단어를 가른다.") + " 이을 음절은 " + game.lastLetter.s2 + "가 된다.");
            }
        }
        else if (state.job === "마하트마간디" && !isAbilityDisabled) {
            if (ability === "억제") {
                if (state.gandhi_stacks < 1) return;
                if (state.suppress_cooldown > 0) return;
                state.gandhi_stacks--; state.suppress_cooldown = 3;
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "억제", "비폭력 스택을 써서 눌러 둔다.") + " 상대는 1턴 동안 유도단어를 쓸 수 없다.");
            }
        }
        else if (state.job === "고죠") {
            if (ability === "무량공처") {
                if (state.gongcheo_uses <= 0) { replier.reply("무량공처 능력을 모두 사용했습니다."); return; }
                if (state.gongcheo_cooldown > 0) { replier.reply("무량공처 쿨타임입니다."); return; }
                state.gongcheo_uses -= 1; state.gongcheo_cooldown = 2;
                oppState.no_hanbang_turns = Math.max(oppState.no_hanbang_turns, 1);
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                oppState.absolutely_disabled = 1;
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "무량공처", "내 영역 속에서 모든 것을 멈춘다.") + " 상대는 1턴 동안 공격단어를 쓸 수 없고 패시브와 능력이 절대 봉쇄된다.");
            }
        }
        else if (state.job === "수리사" && !isAbilityDisabled) {
            if (ability === "수리") {
                if (state.repair_uses >= 4) return;
                if (state.repair_cooldown > 0) return;
                let decom = decomposeSyllable(game.lastLetter.s2);
                const swapMap = { "ㅏ": "ㅜ", "ㅑ": "ㅠ", "ㅓ": "ㅗ", "ㅕ": "ㅛ", "ㅣ": "ㅡ", "ㅜ": "ㅏ", "ㅠ": "ㅑ", "ㅗ": "ㅓ", "ㅛ": "ㅕ", "ㅡ": "ㅣ" };
                if (decom && swapMap[decom.jungsung]) {
                    let JungList = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
                    let newChar = composeSyllable(decom.ci, JungList.indexOf(swapMap[decom.jungsung]), decom.gi);
                    game.lastLetter.s2 = newChar;
                    game.lastLetter.s1 = applyDuEum(newChar);
                    state.repair_uses++; state.repair_cooldown = 6; state.no_yudo_turns = Math.max(state.no_yudo_turns, 1);
                    replyJob(replier, state.job, getJobDialogue(state.job, "active", "수리", "음절을 손본다.") + " 이을 음절은 " + newChar + "가 되고 1턴 동안 유도단어를 쓸 수 없다.");
                } else {
                    replier.reply("수리할 수 없는 모음입니다.");
                }
            }
        }
        else if (state.job === "우라늄" && !isAbilityDisabled) {
            if (ability === "핵분열") {
                if (state.fission_uses >= 1) {
                    replier.reply("핵분열은 이미 사용했습니다.");
                    return;
                }
                if (game.history.length === 0) {
                    replier.reply("핵분열은 상대 단어가 존재할 때만 사용할 수 있습니다.");
                    return;
                }
                let lastWord = game.history[game.history.length - 1];
                let availableSyllables = getNonFirstSyllables(lastWord);
                if (!availableSyllables.length) {
                    replier.reply("핵분열로 이어갈 수 있는 추가 음절이 없습니다.");
                    return;
                }
                state.fission_uses++;
                state.fission_active = true;
                state.fission_syllables = availableSyllables;
                state.no_hanbang_turns = Math.max(state.no_hanbang_turns, 1);
                state.no_yudo_turns = Math.max(state.no_yudo_turns, 1);
                replyJob(replier, state.job, getJobDialogue(state.job, "active", "핵분열", "핵분열을 시작한다.") + " 이번 턴에는 " + availableSyllables.join(", ") + " 음절로도 이을 수 있고 한방단어와 유도단어는 쓸 수 없다.");
            }
        }
        // 마하트마간디 비폭력: 능력 사용 턴 마킹 (수학자 외 모든 직업 공통)
        state.used_active_this_turn = true;
        return;
    }


    // --- 단어 입력 ---
    if (msg.startsWith(INPUT_PFX)) {
        if (!game || game.phase !== "playing") return;
        let word = msg.substring(INPUT_PFX.length).trim();
        if (word.length < 2) return;

        if (game.currentTurnIndex !== -1 && sender !== game.players[game.currentTurnIndex]) {
            replier.reply(sender + "님의 차례가 아닙니다."); return;
        }

        let state = game.playerStates[sender];
        let is_hb = isHanbang(word);
        let is_yd = isYudo(word);
        let is_rt = isRoot(word);
        let canUseKnightExchange = state.job === "나이트" && state.exchange_active && is_rt;
        let is_exception = is_hb || is_yd;

        let oppIndex = game.currentTurnIndex === -1 ? (game.players.indexOf(sender) + 1) % 2 : (game.currentTurnIndex + 1) % 2;
        let oppState = game.playerStates[game.players[oppIndex]];

        // ==========================
        // VALIDATION (검증 단계)
        // ==========================

        // 1. [기본 룰] 첫 수 한방/유도 금지
        if (game.history.length === 0 && is_exception) {
            replier.reply("채린룰 위반: 첫 수에는 한방단어나 유도단어를 사용할 수 없습니다."); return;
        }

        // 2. [사전 체크 및 임시단어 허용]
        let isValidWord = (WORD_SET && WORD_SET.has(word)) || (game.customWords && game.customWords.has(word));
        // 전우치 잔상 (이을 단어 없을 때) 로직은 생략 (판단하기 매우 어려움 - 사용자 자율이거나 우회)
        if (!isValidWord && state.job === "뜀틀선수" && word === "뜀틀") isValidWord = true; // 뜀틀선수 특권
        if (!isValidWord && state.job === "과학자" && state.challenge_active) isValidWord = true;

        if (!isValidWord) {
            if (state.job !== "해커" || state.jojak_active === 0) { // 해커 조작은 사전 외 단어를 허용하는게 아니라 중복을 허용함. 단어 자체는 있어야함.
                replier.reply("사전에 등록되지 않은 단어입니다."); return;
            }
        }

        // 3. [중복 단어 체크]
        if (game.used.has(word)) {
            if (state.job === "해커" && state.jojak_active > 0) {
                replier.reply("조작 능력이 적용되어 중복 단어 [" + word + "] 를 재사용했습니다.");
            } else if (canUseKnightExchange) {
            } else {
                replier.reply("이미 사용된 단어입니다."); return;
            }
        }

        // 4. [끝말 잇기 검증]
        let currentNextChar = nextCharForWord(game);
        let canUseFissionRoute = state.job === "우라늄" && state.fission_active && state.fission_syllables.indexOf(word[0]) !== -1;
        if (game.history.length > 0) {
            // 환자 환각증 앞말잇기 강제
            if (state.hallucination_active) {
                let lastWord = game.history[game.history.length - 1];
                if (word[word.length - 1] !== lastWord[0]) {
                    replier.reply("환각증 여파로 이전 단어의 '첫음절'로 끝나는 앞말잇기를 해야 합니다."); return;
                }
            } else {
                if (word[0] !== game.lastLetter.s1 && word[0] !== game.lastLetter.s2 && word[0] !== nextw && !canUseFissionRoute && !canUseKnightExchange) {
                    replier.reply("'" + currentNextChar + "'(으)로 시작해야 합니다."); return;
                }
            }
        }

        // 5. [디버프 제약 검사]
        // 고죠 - 절대 봉쇄 (무량공처)
        if (state.absolutely_disabled > 0) {
            if (is_exception) { replier.reply("영역 전개 [무량공처]의 영향으로 공격단어를 사용할 수 없습니다."); return; }
        }

        // 고죠 - 무하한 (되돌림단어 금지)
        if (oppState && oppState.job === "고죠" && !oppState.lost_abilities && oppState.disabled_turns === 0 && oppState.absolutely_disabled === 0) {
            if (word[0] === word[word.length - 1]) {
                replier.reply("고죠 패시브 [무하한]: 되돌림단어(첫음절과 끝음절이 같은 단어)를 사용할 수 없습니다."); return;
            }
        }

        // 갈릴레오 - 관성의 법칙
        if (oppState && oppState.job === "갈릴레오" && !oppState.lost_abilities) {
            let galileoLast = decomposeSyllable(word[word.length - 1]);
            if (galileoLast && (galileoLast.chosung === "ㄲ" || galileoLast.chosung === "ㄸ" || galileoLast.chosung === "ㅃ" || galileoLast.chosung === "ㅆ" || galileoLast.chosung === "ㅉ")) {
                replyJob(replier, oppState.job, getJobDialogue(oppState.job, "passive", "관성의 법칙", "쌍자음으로 끝나는 단어는 받아들이지 않는다.") + " 끝음절 초성이 쌍자음인 단어는 사용할 수 없다.");
                return;
            }
        }

        // 수리사 - 방탄 (저연결단어 금지)
        if (state.bulletproof_debuff_turns > 0) {
            let nextSyl = word[word.length - 1];
            let nextDue = applyDuEum(nextSyl);
            let count1 = 0, count2 = 0;
            if (Object.keys(WORDS_BY_START).length > 0) {
                count1 = (WORDS_BY_START[nextSyl] || []).filter(function (w) { return !game.used.has(w) && !(game.bannedWords && game.bannedWords.has(w)); }).length;
                count2 = (nextDue !== nextSyl) ? (WORDS_BY_START[nextDue] || []).filter(function (w) { return !game.used.has(w) && !(game.bannedWords && game.bannedWords.has(w)); }).length : 0;
            } else if (WORD_LIST && WORD_LIST.length > 0) {
                for (let i = 0; i < WORD_LIST.length; i++) {
                    let w = WORD_LIST[i];
                    if (!game.used.has(w) && !(game.bannedWords && game.bannedWords.has(w))) {
                        if (w[0] === nextSyl) count1++;
                        else if (nextDue !== nextSyl && w[0] === nextDue) count2++;
                    }
                }
            }
            let totalAvailable = count1 + count2;
            if (totalAvailable <= 10) {
                replier.reply("수리사 패시브 [방탄]: 10개 이하로 이어지는 단어는 사용할 수 없습니다. (현재 " + totalAvailable + "개)"); return;
            }
        }

        // 혜성전사 - 영구 결계
        if (state.comet_final_lock) {
            let lastDecomposed = decomposeSyllable(word[word.length - 1]);
            let lastChosung = lastDecomposed ? lastDecomposed.chosung : "";
            if (lastChosung !== "ㅎ" && lastChosung !== "ㅅ") {
                replier.reply("혜성전사 패시브 [핼리 혜성]: 끝음절 초성이 [ㅎ, ㅅ]인 단어만 사용할 수 있습니다."); return;
            }
        }

        if (state.no_du_eum_turns > 0 && word[0] === game.lastLetter.s1 && game.lastLetter.s1 !== game.lastLetter.s2) {
            replier.reply("디버프: 두음법칙을 사용할 수 없습니다."); return;
        }
        if (state.no_hanbang_turns > 0 && is_hb) {
            replier.reply("디버프: 한방단어를 사용할 수 없습니다."); return;
        }
        if (state.no_yudo_turns > 0 && is_yd) {
            replier.reply("디버프: 유도단어를 사용할 수 없습니다."); return;
        }
        if (state.no_all_batchim_turns > 0 && isAllBatchimWord(word)) {
            replier.reply("디버프: 모든 음절에 받침이 있는 단어를 사용할 수 없습니다."); return;
        }
        if (state.only_even_turns > 0 && word.length % 2 !== 0) {
            replier.reply("디버프: 짝수 글자 수의 단어만 사용할 수 있습니다."); return;
        }
        if (state.only_length_2_forever && word.length !== 2) {
            replier.reply("감마선 피폭 상태에서는 2글자 단어만 사용할 수 있습니다."); return;
        }
        if (state.no_length_2_turns > 0 && word.length === 2) {
            replier.reply("디버프: 2글자 단어를 사용할 수 없습니다."); return;
        }
        if (state.only_odd_turns > 0 && word.length % 2 === 0) {
            replier.reply("디버프: 홀수 글자 수의 단어만 사용할 수 있습니다."); return;
        }
        if (state.only_length_2_turns > 0 && word.length !== 2) {
            replier.reply("디버프: 두 글자 단어만 사용할 수 있습니다."); return;
        }
        if (state.only_root_turns > 0 && !is_rt) {
            replier.reply("디버프: 루트단어만 사용할 수 있습니다."); return;
        }
        if (state.last_route_only_turns > 0 && (!ROUTESYL_SET || !ROUTESYL_SET.has(word[word.length - 1]))) {
            replier.reply("디버프: 끝음절이 루트음절인 단어만 사용할 수 있습니다."); return;
        }
        if (state.limited_length > 0 && word.length > state.limited_length) {
            replier.reply("디버프: " + state.limited_length + "글자 이하의 단어만 사용할 수 있습니다."); return;
        }
        if (state.job === "스폰지밥" && isSpongebobWanted(state) && word.length >= 5) {
            replier.reply("현상수배 상태에서는 5글자 이상의 단어를 사용할 수 없습니다."); return;
        }
        if (state.min_length > 0 && word.length < state.min_length) {
            replier.reply("디버프: " + state.min_length + "글자 이상의 단어만 사용할 수 있습니다. (현재 " + word.length + "글자)"); return;
        }
        if (state.target_active_turns > 0 && word.length >= 5) {
            replier.reply("비밀요원 타깃 포착 중: 5글자 이상의 단어를 사용할 수 없습니다."); return;
        }
        if (state.no_long_yudo_turns > 0 && is_yd && word.length >= 3) {
            replier.reply("디버프: 3글자 이상의 유도단어를 사용할 수 없습니다."); return;
        }

        let isAbilityDisabled = state.disabled_turns > 0 || state.lost_abilities || state.absolutely_disabled > 0;

        // 공룡 [브레스/삼키기/꼬리날리기], 검객 가르기 특수 판정
        if (state.dino_swallowed) {
            if (word.length > 3 || is_exception) { replier.reply("삼킨 직후에는 3글자 이하 일반단어만 가능합니다."); return; }
        }

        // 악당 [결계] 검사
        if (oppState && oppState.job === "악당" && oppState.barrier_turns > 0) {
            let lastChosung = decomposeSyllable(word[word.length - 1]).chosung;
            if (oppState.barrier_chosungs.includes(lastChosung)) {
                replier.reply("악당의 결계에 가로막혔습니다! (끝음절 초성 [" + lastChosung + "] 사용 불가)"); return;
            }
        }

        // 혜성전사 [핼리 혜성] 검사
        if (oppState && oppState.job === "혜성전사" && oppState.comet_barrier_turns > 0) {
            let cometLastDecomposed = decomposeSyllable(word[word.length - 1]);
            let cometLastChosung = cometLastDecomposed ? cometLastDecomposed.chosung : "";
            if (oppState.comet_barrier_chosungs.includes(cometLastChosung)) {
                replier.reply("혜성전사의 결계에 가로막혔습니다! (끝음절 초성 [" + cometLastChosung + "] 사용 불가)"); return;
            }
            if (is_yd) {
                replier.reply("혜성전사 패시브 [핼리 혜성]: 결계가 유지되는 동안 유도단어를 사용할 수 없습니다."); return;
            }
        }

        // 기자 [방송] 검사
        if (oppState && oppState.job === "기자" && oppState.report_turns > 0) {
            if (is_exception) {
                // 음절을 P삐 로 바꿈
                word = word.substring(0, word.length - 1) + "삐";
                state.disabled_turns = Math.max(state.disabled_turns, 1);
                state.no_yudo_turns = Math.max(state.no_yudo_turns, 1);
                replier.reply("기자 버프 발동: 방송 중 예외단어를 사용하여, 마지막 음절이 '삐'로 변경되었으며 1턴간 유도 및 능력 불가상태가 됩니다.");
            }
        }

        // 마법사 [부작용] 검사
        if (state.job === "마법사" && game.turnCount <= 14 && is_exception) {
            replier.reply("마법사 패시브 [부작용]: 14턴 이전에는 한방/유도단어를 사용할 수 없습니다."); return;
        }

        // 기관사 [운행] 검사
        if (oppState && oppState.job === "기관사" && state.job !== "기관사") {
            // 상대가 기관사이고 전철역 정차중
            if (game.turnCount % 3 === 0) {
                if (word.length > oppState.train_stations) {
                    replier.reply("기관사 전철역 정차 중: 종점까지 남은 역 수(" + oppState.train_stations + ")보다 긴 단어를 사용할 수 없습니다."); return;
                }
            }
        }


        if (game.currentTurnIndex === -1) {
            game.currentTurnIndex = game.players.indexOf(sender);
            game.firstTurnIndex = game.currentTurnIndex;
        }

        // ==========================
        // PASSIVE & ACTION (효과 발생 단계)
        // ==========================
        let msgs = [];
        let cometBarrierEndedThisTurn = false;

        // 뜀틀선수 [뜀틀] 패시브
        if (state.job === "뜀틀선수" && word === "뜀틀" && !isAbilityDisabled) {
            if (state.vault_uses >= state.vault_max) { replier.reply("뜀틀 사용 횟수가 고갈되었습니다."); return; }
            if (state.vault_cooldown > 0) { replier.reply("뜀틀 쿨타임입니다."); return; }
            state.vault_uses++;
            state.vault_cooldown = 5;
            oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
            oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
            pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "뜀틀", "도약으로 상대 흐름을 끊는다.") + " 상대는 1턴 동안 유도단어와 능력, 패시브를 사용할 수 없다.");
        }

        // 해커 초토화 피격 검사
        if (oppState && oppState.job === "해커" && oppState.chotohwa_active > 0) {
            if (word.length >= 4 || is_exception) {
                state.lost_abilities = true;
                pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "초토화", "초토화가 터져 상대 능력을 지워 버린다.") + " " + sender + "의 능력이 영구 상실된다.");
            }
            oppState.chotohwa_active -= 1;
        }

        // 투자자 패시브
        if (oppState && oppState.job === "투자자" && !oppState.lost_abilities && oppState.disabled_turns === 0 && oppState.absolutely_disabled === 0) {
            let change = 0;
            if (oppState.juga_jojak_active) {
                change = -word.length;
                oppState.juga_jojak_active = false;
                pushSystem(msgs, "주가 조작 여파로 주가가 " + word.length + "만큼 하락한다.");
            } else {
                change = word.length % 2 === 0 ? -word.length : word.length;
            }
            oppState.investor_stock += change;
            let dispStr = change > 0 ? ("상승(+" + change + ")") : ("하락(" + change + ")");
            pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "투자의 귀재", "상대 단어를 보고 주가를 다시 계산한다.") + " 주가 " + dispStr + ". 현재 주가 " + oppState.investor_stock + ", 목표 턴 " + game.turnCount + ".");
            if (oppState.investor_stock <= game.turnCount) {
                replier.reply(joinLines([
                    msgs.join("\n"),
                    systemLine(game.players[oppIndex] + "의 주가 폭락 조건이 충족되어 경기가 끝난다.")
                ]));
                finishTierGame(room, game.players[oppIndex], "투자의 귀재", replier);
                delete games[room]; return;
            }
        }

        // 환자 [강박증]
        if (oppState && oppState.job === "환자" && !oppState.lost_abilities && oppState.disabled_turns === 0 && oppState.absolutely_disabled === 0) {
            if (word.length % 2 !== 0 && oppState.opcd_cooldown === 0) { // 홀수 단어 사용시
                oppState.opcd_cooldown = 3;
                state.only_even_turns = Math.max(state.only_even_turns, 1);
                state.disabled_turns = Math.max(state.disabled_turns, 1);
                state.no_yudo_turns = Math.max(state.no_yudo_turns, 1);
                pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "강박증", "홀수 길이를 보고 짝수만 허용하겠다고 몰아붙인다.") + " 상대는 1턴 동안 짝수 글자 단어만 쓸 수 있고 유도단어와 능력도 사용할 수 없다.");
            }
        }

        // 수집가 [수집]
        if (oppState && oppState.job === "수집가" && !oppState.lost_abilities && oppState.disabled_turns === 0 && oppState.absolutely_disabled === 0) {
            let collected = [word[0]];
            if (oppState.mine_active > 0) {
                collected = word.split('');
                oppState.mine_active = 0;
                pushSystem(msgs, "채굴 효과로 단어의 모든 음절을 수집한다.");
            }
            oppState.collected_syllables = oppState.collected_syllables.concat(collected);
            pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "수집", "상대가 남긴 음절을 챙긴다.") + " 수집 음절: " + collected.join(", ") + ".");
        }
        if (state.job === "수집가" && game.customWords && game.customWords.has(word)) { // 추가단어 사용
            oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
            pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "추가단어 사용", "직접 만든 단어로 상대 흐름을 끊는다.") + " 상대는 1턴 동안 능력을 사용할 수 없다.");
            game.customWords.delete(word);
        }

        // 감시자 [감시]
        if (oppState && oppState.job === "감시자" && !oppState.lost_abilities && oppState.disabled_turns === 0 && oppState.absolutely_disabled === 0) {
            let deduction = 0;
            if (is_yd) deduction += 4;
            if (is_hb) deduction += 8;
            if (is_rt) deduction += 2;

            let debuff_count = (oppState.disabled_turns > 0 ? 1 : 0) + (oppState.no_yudo_turns > 0 ? 1 : 0) + (oppState.no_hanbang_turns > 0 ? 1 : 0) + (oppState.no_du_eum_turns > 0 ? 1 : 0);
            deduction += debuff_count;

            if (oppState.detect_active_turns > 0) {
                deduction *= 2;
                oppState.detect_active_turns -= 1;
            }

            if (deduction > 0) {
                oppState.watch_count -= deduction;
                pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "감시", "규칙 위반을 세고 감시 수를 깎는다.") + " 감시 수가 " + deduction + " 줄어 현재 " + oppState.watch_count + "가 된다.");
                if (oppState.watch_count <= 0) {
                    oppState.watch_count = 0;
                    pushSystem(msgs, "감시 수가 0이 되어 감시자는 이제 이을 음절과 무관하게 단어를 사용할 수 있다.");
                }
            }
        }

        // 늑대인간 [포효]
        if (state.job === "늑대인간" && !isAbilityDisabled && state.roar_cooldown === 0) {
            let count = (word.match(/[ㅇㅎ]/g) || []).length;
            if (count >= 1) {
                oppState.only_even_turns = Math.max(oppState.only_even_turns, 2);
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "포효", "단어 속 울음소리로 상대를 위축시킨다.") + " 상대는 2턴 동안 짝수 글자 단어만 사용할 수 있다.");
                if (count >= 3) {
                    oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                    pushSystem(msgs, "포효가 깊어져 상대는 1턴 동안 능력을 사용할 수 없다.");
                }
                state.roar_cooldown = 2;
            }
        }

        // 과학자 [실험]
        if (state.job === "과학자" && state.experiment_cooldown === 0) {
            let experimentCount = 0;
            for (let i = 0; i < word.length; i++) {
                let decomposed = decomposeSyllable(word[i]);
                if (decomposed) {
                    if (decomposed.chosung === "ㅇ" || decomposed.chosung === "ㅅ" || decomposed.chosung === "ㅎ") experimentCount++;
                    if (decomposed.jongsung === "ㅇ" || decomposed.jongsung === "ㅅ" || decomposed.jongsung === "ㅎ") experimentCount++;
                }
            }

            if (experimentCount >= 4) {
                state.experiment_cooldown = 1;
                state.experiment_success_total++;
                oppState.no_hanbang_turns = Math.max(oppState.no_hanbang_turns, 1);
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "실험", "특정 자모가 많은 단어를 보고 실험을 성공시킨다.") + " 상대는 1턴 동안 공격단어와 능력, 패시브를 사용할 수 없다.");

                if (state.dna_tracking && state.dna_target) {
                    state.dna_success_streak++;
                    if (state.dna_success_streak >= 2) {
                        if (!oppState.destroyed_active_abilities.includes(state.dna_target)) {
                            oppState.destroyed_active_abilities.push(state.dna_target);
                        }
                        pushSystem(msgs, "DNA파괴가 완성되어 " + game.players[oppIndex] + "의 " + state.dna_target + " 능력이 파괴된다.");
                        state.dna_tracking = false;
                        state.dna_success_streak = 0;
                        state.dna_target = null;
                    }
                }
            } else if (state.dna_tracking) {
                state.dna_success_streak = 0;
            }
        } else if (state.job === "과학자" && state.dna_tracking) {
            state.dna_success_streak = 0;
        }

        // 갈릴레오 [관측]
        if (state.job === "갈릴레오" && !state.lost_abilities) {
            let newMoons = getGalileoNewMoons(state, word);
            if (newMoons.length > 0) {
                oppState.last_route_only_turns = Math.max(oppState.last_route_only_turns, 3);
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "관측", "초성과 종성을 분석해 위성을 찾아낸다.") + " 새로 발견한 위성: " + newMoons.join(", ") + ".");
                pushSystem(msgs, "상대는 3턴 동안 끝음절이 루트음절인 단어만 사용할 수 있다.");
                if (hasGalileoCompleteSet(state)) {
                    replier.reply(joinLines([
                        msgs.join("\n"),
                        jobLine(state.job, getJobDialogue(state.job, "passive", "지동설", "네 개의 위성이 모두 모습을 드러냈다.") + " 지동설이 증명된다."),
                        systemLine(sender + "이 네 위성을 모두 발견해 경기가 끝난다.")
                    ]));
                    finishTierGame(room, sender, "지동설", replier);
                    delete games[room]; return;
                }
            }
        }

        // 작곡가 [작곡]
        if (oppState && oppState.job === "작곡가" && !oppState.lost_abilities) {
            let noteType = null;
            if (word.length === 2) noteType = "2";
            else if (word.length === 4) noteType = "4";
            else if (word.length === 8) noteType = "8";

            if (noteType) {
                if (oppState.split_pending) {
                    if (noteType === "2") noteType = "4";
                    else if (noteType === "4") noteType = "8";
                    oppState.split_pending = false;
                }

                oppState.compose_notes.push(noteType);
                oppState.compose_units += composerNoteToUnits(noteType);

                while (oppState.compose_units > oppState.compose_target_units) {
                    oppState.compose_target_units += 8;
                }

                pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "작곡", "상대가 남긴 길이를 음표로 적어 넣는다.") + " " + noteType + "분음표를 악보에 추가한다.");

                if (oppState.compose_units === oppState.compose_target_units) {
                    let hasEight = false;
                    let quarterCount = 0;
                    for (let i = 0; i < oppState.compose_notes.length; i++) {
                        if (oppState.compose_notes[i] === "8") hasEight = true;
                        if (oppState.compose_notes[i] === "4") quarterCount++;
                    }

                    pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "완성", "한 마디가 끝나며 악보 효과가 울린다.") + " 한 마디가 완성되었다.");

                    if (hasEight) {
                        replier.reply(joinLines([
                            msgs.join("\n"),
                            jobLine(oppState.job, getJobDialogue(oppState.job, "passive", "즉흥 승리", "8분음표가 섞인 마디가 완성되었다.") + " 연주가 완성된다."),
                            systemLine(game.players[oppIndex] + "의 마디에 8분음표가 포함되어 경기가 끝난다.")
                        ]));
                        finishTierGame(room, game.players[oppIndex], "작곡", replier);
                        delete games[room]; return;
                    }

                    if (quarterCount > 0) {
                        state.no_yudo_turns = Math.max(state.no_yudo_turns, quarterCount);
                        pushSystem(msgs, "상대는 " + quarterCount + "턴 동안 유도단어를 사용할 수 없다.");
                    }

                    oppState.compose_notes = [];
                    oppState.compose_units = 0;
                    oppState.compose_target_units = 8;
                }
            }
        }

        // 스폰지밥 [저금통]
        if (oppState && oppState.job === "스폰지밥" && !oppState.lost_abilities && oppState.disabled_turns === 0 && oppState.absolutely_disabled === 0) {
            let saveGain = addSpongebobMoney(oppState, word.length * 1000);
            let saveText = saveGain.doubled ? " 보너스 효과로 " + saveGain.amount + "원을" : " " + saveGain.amount + "원을";
            pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "저금통", "상대가 말할 때마다 저금통에 돈을 모은다.") + saveText + " 저금한다. 현재 잔액은 " + oppState.money + "원이다.");
        }

        // 스폰지밥 [강도 채용]
        if (state.job === "스폰지밥" && state.robber_turns > 0) {
            if (state.robber_skip_current) {
                state.robber_skip_current = false;
            } else {
                let robberGain = addSpongebobMoney(state, 5000);
                state.robber_turns -= 1;
                let robberText = robberGain.doubled ? " 보너스 효과로 수익이 " + robberGain.amount + "원으로 불어났다." : " " + robberGain.amount + "원이 들어온다.";
                pushJob(msgs, state.job, getJobDialogue(state.job, "active", "강도 채용", "위험을 감수하고 은행 습격 수익을 굴린다.") + robberText + " 남은 습격 수익은 " + state.robber_turns + "회다.");
            }
        }

        // 나이트 [L자 도약]
        if (state.job === "나이트") {
            state.knight_pattern.push(word.length);
            if (state.knight_pattern.length > 3) state.knight_pattern.shift();

            if (state.knight_pattern.length === 3 && state.knight_pattern[0] === 2 && state.knight_pattern[1] === 4 && state.knight_pattern[2] === 2) {
                let extendedKnightLock = oppState.knight_lock_turns > 0 || oppState.knight_silence_turns > 0;
                if (extendedKnightLock) {
                    oppState.knight_lock_turns += 1;
                    oppState.knight_silence_turns += 1;
                } else {
                    oppState.knight_lock_turns = 2;
                    oppState.knight_silence_turns = 1;
                }
                oppState.no_hanbang_turns = Math.max(oppState.no_hanbang_turns, oppState.knight_lock_turns);
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, oppState.knight_lock_turns);
                oppState.no_length_2_turns = Math.max(oppState.no_length_2_turns, oppState.knight_lock_turns);
                oppState.disabled_turns = Math.max(oppState.disabled_turns, oppState.knight_silence_turns);
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "L자 도약", "2-4-2 리듬이 맞으면 상대를 봉쇄한다.") + (extendedKnightLock ? " 이미 걸린 봉쇄의 지속 시간이 1턴씩 늘어난다." : " 상대는 2턴 동안 공격단어와 2글자 단어를 사용할 수 없고 1턴 동안 패시브와 능력을 사용할 수 없다."));
            }
        }

        // 나이트 [교환] 활성화
        if (oppState && oppState.job === "나이트" && oppState.exchange_pending) {
            oppState.exchange_pending = false;
            oppState.exchange_active = true;
            pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "active", "교환", "다음 차례에는 아무 루트단어로 말을 바꿔 탄다.") + " 다음 차례에는 어떤 음절을 받았든 아무 루트단어를 중복과 무관하게 사용할 수 있다.");
        }

        // 비밀요원 [타깃 확보]
        if (state.job === "비밀요원" && !isAbilityDisabled) {
            // 제출한 단어의 마지막 음절로 시작하는 4글자 이하 유도/루트단어 최대 3개 수집
            let tgt_last = word[word.length - 1];
            let tgt_due = applyDuEum(tgt_last);
            let foundTargets = [];
            let candidateBuckets = [];
            if (Object.keys(WORDS_BY_START).length > 0) {
                if (WORDS_BY_START[tgt_last]) candidateBuckets.push(WORDS_BY_START[tgt_last]);
                if (tgt_due !== tgt_last && WORDS_BY_START[tgt_due]) candidateBuckets.push(WORDS_BY_START[tgt_due]);
            } else if (WORD_LIST && WORD_LIST.length > 0) {
                let fallbackBucket = [];
                for (let i = 0; i < WORD_LIST.length; i++) {
                    if (WORD_LIST[i][0] === tgt_last || WORD_LIST[i][0] === tgt_due) fallbackBucket.push(WORD_LIST[i]);
                }
                candidateBuckets.push(fallbackBucket);
            }
            for (let i = 0; i < candidateBuckets.length && foundTargets.length < 3; i++) {
                let bucket = candidateBuckets[i];
                for (let j = 0; j < bucket.length && foundTargets.length < 3; j++) {
                    let w = bucket[j];
                    if (w.length <= 4 && !game.used.has(w) && !(game.bannedWords && game.bannedWords.has(w))) {
                        if ((isYudo(w) || isRoot(w)) && foundTargets.indexOf(w) === -1) foundTargets.push(w);
                    }
                }
            }
            if (foundTargets.length > 0) {
                state.targets = foundTargets;
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "타깃 확보", "후속 단어를 미리 포착한다.") + " 타깃: " + foundTargets.join(", ") + ".");
            } else {
                state.targets = [];
            }
        }
        if (oppState && oppState.job === "비밀요원" && oppState.targets.length > 0 && oppState.targets.includes(word)) {
            state.disabled_turns = Math.max(state.disabled_turns, 1);
            state.target_active_turns = 2;
            pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "타깃 적중", "예상한 타깃이 걸려들었다.") + " 상대는 1턴 동안 능력을 쓰지 못하고 2턴 동안 5글자 이상 단어를 사용할 수 없다.");
            oppState.targets = [];
        }

        // 67 [67]
        if (state.job === "67" && !isAbilityDisabled && state.sixtyseven_cooldown === 0) {
            if (word.length === 6) {
                state.sixtyseven_cooldown = 1;
                if (oppState.no_yudo_turns > 0) oppState.no_yudo_turns += 7;
                else {
                    oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 7);
                    oppState.no_hanbang_turns = Math.max(oppState.no_hanbang_turns, 1);
                }
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "67", "유도 금지 턴을 길게 누적시킨다.") + " 상대의 유도 금지 턴이 늘고 한방단어도 잠시 막힌다.");
                if (oppState.no_yudo_turns >= 67) {
                    replier.reply(joinLines([
                        msgs.join("\n"),
                        systemLine(game.players[game.currentTurnIndex] + "의 유도 금지 수치가 67에 도달해 경기가 끝난다.")
                    ]));
                    finishTierGame(room, game.players[game.currentTurnIndex], "67", replier);
                    delete games[room]; return;
                }
            }
        }

        // 우라늄 [방사선]
        if (state.job === "우라늄" && !isAbilityDisabled) {
            if (word.length === 2) {
                state.uranium_two_streak += 1;
                if (!state.uranium_gamma_chain || state.uranium_gamma_chain.length === 0) state.uranium_gamma_chain = [2];
                else state.uranium_gamma_chain = [2];
            } else {
                state.uranium_two_streak = 0;
                if (state.uranium_gamma_chain && state.uranium_gamma_chain.length > 0) {
                    let expectedLength = state.uranium_gamma_chain[state.uranium_gamma_chain.length - 1] + 1;
                    if (word.length === expectedLength && expectedLength <= 6) state.uranium_gamma_chain.push(word.length);
                    else state.uranium_gamma_chain = [];
                }
            }

            if (word.length === 3 && state.radiation_cooldown === 0) {
                state.radiation_cooldown = 1;
                oppState.no_all_batchim_turns = Math.max(oppState.no_all_batchim_turns, 1);
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "알파선", "받침이 꽉 찬 단어를 한동안 막아 둔다.") + " 상대는 1턴 동안 모든 음절에 받침이 있는 단어를 사용할 수 없다.");
            }
            if (word.length === 2 && state.uranium_two_streak > 0 && state.uranium_two_streak % 3 === 0 && state.radiation_cooldown === 0) {
                state.radiation_cooldown = 1;
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 2);
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "베타선", "상대 능력을 잠시 멈춰 세운다.") + " 상대는 2턴 동안 패시브와 능력을 사용할 수 없다.");
            }
            if (state.uranium_gamma_chain && state.uranium_gamma_chain.join(",") === "2,3,4,5,6") {
                state.radiation_cooldown = 1;
                oppState.only_length_2_forever = true;
                state.uranium_gamma_chain = [];
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "감마선", "상대를 두 글자 리듬에 영구히 가둔다.") + " 상대는 이제 영구적으로 2글자 단어만 사용할 수 있다.");
            }
        }

        // 사과 [삭와] - 단어 전체 글자의 초성/종성 체크
        if (state.job === "사과" && !isAbilityDisabled) {
            if (state.apple_passive_cooldown === 0) {
                let countApple = 0;
                let checkArr = ["ㅅ", "ㄱ", "ㄴ", "ㅁ", "ㅇ"];
                for (let i = 0; i < word.length; i++) {
                    let d = decomposeSyllable(word[i]);
                    if (d) {
                        if (checkArr.includes(d.chosung)) countApple++;
                        if (d.jongsung && checkArr.includes(d.jongsung)) countApple++;
                    }
                }
                if (countApple >= 2) {
                    if (state.apple_unused_turns >= 10) {
                        replier.reply(joinLines([
                            msgs.join("\n"),
                            jobLine(state.job, getJobDialogue(state.job, "passive", "삭와", "사과 디버프를 더 짙게 남긴다.") + " 오래 익은 효과가 폭발한다."),
                            systemLine(sender + "의 삭와가 완전히 숙성되어 경기가 끝난다.")
                        ]));
                        finishTierGame(room, sender, "삭와", replier);
                        delete games[room]; return;
                    }
                    if (oppState.apple_debuff_turns > 0) oppState.apple_debuff_turns += 2;
                    else oppState.apple_debuff_turns = 3;
                    state.apple_passive_cooldown = 2;
                    state.apple_unused_turns = 0;
                    pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "삭와", "사과 디버프를 더 짙게 남긴다.") + " 조건 수치 " + countApple + ". 상대에게 사과 디버프를 건다.");
                } else {
                    state.apple_unused_turns++;
                }
            } else {
                state.apple_unused_turns++;
            }
        }

        // 마하트마간디 [비폭력]
        if (oppState && oppState.job === "마하트마간디" && !oppState.lost_abilities) {
            if (is_hb || is_yd) {
                oppState.gandhi_stacks++;
                pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "비폭력", "거친 수를 한 번 더 기록한다.") + " 현재 스택은 " + oppState.gandhi_stacks + "이다.");
            }
            if (oppState.gandhi_stacks >= 3) {
                replier.reply(joinLines([
                    msgs.join("\n"),
                    systemLine(game.players[oppIndex] + "의 비폭력 스택이 3에 도달해 경기가 끝난다.")
                ]));
                finishTierGame(room, game.players[oppIndex], "비폭력", replier);
                delete games[room]; return;
            }
        }

        // 은하계전사 [별인 듯 달 아닌 별]
        if (state.job === "은하계전사" && !isAbilityDisabled && state.star_cooldown === 0) {
            if (word.includes("별") || word.includes("달")) {
                state.star_stacks++;
                state.star_cooldown = 1;
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 2);
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "별인 듯 달 아닌 별", "별과 달의 흔적으로 상대를 묶는다.") + " 상대는 2턴 동안 능력과 패시브를 사용할 수 없다.");
                // 16턴 이전 3회 이상 사용 → 끝음절 [벨] 고정
                if (state.star_stacks >= 3 && game.turnCount < 16 && !state.star_permanent_done) {
                    word = word.substring(0, word.length - 1) + "벨";
                    state.star_permanent_done = true;
                    pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "벨", "이번엔 끝음절을 벨로 남긴다.") + " 끝음절이 벨로 고정된다.");
                }
                // 16턴 이상, 16턴 이전에 벨 지급 이력 있음, 아직 궁극기 미사용
                if (game.turnCount >= 16 && state.star_permanent_done && !state.star_ult_used) {
                    word = word.substring(0, word.length - 1) + "볠";
                    state.star_ult_used = true;
                    oppState.lost_abilities = true;
                    pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "볠", "더 강한 흔적으로 상대 능력을 꺼 버린다.") + " 끝음절이 볠로 바뀌고 상대 능력이 영구 상실된다.");
                }
            }
        }

        // 혜성전사 [핼리 혜성]
        if (state.job === "혜성전사" && state.comet_passive_cooldown === 0) {
            let hasSeong = word.indexOf("성") !== -1;
            let hasHye = word.indexOf("혜") !== -1;

            if (hasSeong) {
                state.comet_seong_count++;
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                if (state.comet_barrier_turns > 0) {
                    state.comet_barrier_turns += 1;
                    pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "핼리 혜성", "성과 혜의 흔적으로 결계를 열고 닫는다.") + " 결계 지속 시간이 1턴 늘어나며 상대는 1턴 동안 유도단어를 사용할 수 없다.");
                } else {
                    state.comet_barrier_turns = 3;
                    state.comet_barrier_chosungs = ["ㄱ", "ㄴ"];
                    pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "핼리 혜성", "성과 혜의 흔적으로 결계를 열고 닫는다.") + " 3턴 동안 혜성 결계가 생성되고 초성은 [ㄱ, ㄴ]으로 시작한다.");
                }
            }

            if (hasHye) {
                state.comet_hye_count++;
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 2);
                if (state.comet_barrier_turns > 0) {
                    state.comet_barrier_turns = 0;
                    state.comet_barrier_chosungs = [];
                    cometBarrierEndedThisTurn = true;
                    pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "핼리 혜성", "성과 혜의 흔적으로 결계를 열고 닫는다.") + " 결계 타이머가 0이 되어 즉시 종료되고 상대는 2턴 동안 유도단어를 사용할 수 없다.");
                } else {
                    pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "핼리 혜성", "성과 혜의 흔적으로 결계를 열고 닫는다.") + " 상대는 2턴 동안 유도단어를 사용할 수 없다.");
                }
            }

            if (!state.comet_final_applied && game.turnCount < 16 && state.comet_seong_count >= 5 && state.comet_hye_count >= 1) {
                state.comet_final_applied = true;
                oppState.comet_final_lock = true;
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "영구 결계", "궤적이 굳어져 상대의 끝음을 영구히 좁힌다.") + " 상대는 이제 영구적으로 끝음절 초성이 [ㅎ, ㅅ]인 단어만 사용할 수 있다.");
            }
        }

        // 사신 [처형]
        if (state.job === "사신" && !isAbilityDisabled) {
            state.execution_count -= word.length;
            pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "처형", "단어 길이만큼 처형 수를 줄인다.") + " 남은 처형 수는 " + state.execution_count + "이다.");
            if (word.length >= 8) {
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                oppState.no_hanbang_turns = Math.max(oppState.no_hanbang_turns, 1);
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                pushSystem(msgs, "처형식이 이어져 상대는 1턴 동안 능력과 한방단어, 유도단어를 사용할 수 없다.");
            }
        }

        // 기관사 [운행] 패시브 - 역 정차 및 종점 도달 처리
        if (state.job === "기관사" && !isAbilityDisabled) {
            // turnCount가 3의 배수인 현재 턴에 기관사가 단어를 제출하면 역 정차
            if (game.turnCount % 3 === 0) {
                state.train_stations--;
                let oppIsEngineer = (oppState.job === "기관사");
                if (!oppIsEngineer) {
                    oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                    oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                    pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "운행", "역에 정차하며 상대의 선택지를 좁힌다.") + " " + (9 - state.train_stations) + "번째 역에 섰다. 남은 역은 " + state.train_stations + "이고 상대는 1턴 동안 유도단어와 능력을 사용할 수 없다.");
                } else {
                    pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "운행", "역에 정차하며 상대의 선택지를 좁힌다.") + " " + (9 - state.train_stations) + "번째 역에 섰다. 기관사 대전이므로 추가 제약은 없고 남은 역은 " + state.train_stations + "이다.");
                }
                if (state.train_stations <= 0) {
                    replier.reply(msgs.join("\n"));
                    if (oppIsEngineer) {
                        replySystem(replier, "기관사끼리 종점에 도달해 무승부로 처리된다.");
                        clearTierGame(room);
                    } else {
                        replySystem(replier, sender + "이 종점에 도착해 경기가 끝난다.");
                        finishTierGame(room, sender, "운행", replier);
                    }
                    delete games[room]; return;
                }
            }
        }

        // 생존자 [신호] 패시브 - SOS 모스부호
        if (state.job === "생존자" && !isAbilityDisabled && state.signal_cooldown === 0) {
            const SOS_SEQ = ["·", "·", "·", "-", "-", "-", "·", "·", "·", "-", "·", "-", "·", "-", "-"];
            let newSignal = word.length === 2 ? "·" : "-";
            let curSeq = state.signal_sequence ? state.signal_sequence.split(" ").filter(function (s) { return s !== ""; }) : [];
            let expected = curSeq.length < SOS_SEQ.length ? SOS_SEQ[curSeq.length] : null;
            if (expected && newSignal === expected) {
                curSeq.push(newSignal);
                state.signal_sequence = curSeq.join(" ");
                state.signal_cooldown = 1;
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "신호", "신호를 한 칸 더 쌓는다.") + " 현재 신호는 " + state.signal_sequence + "이다.");
                if (curSeq.length === 15) {
                    replier.reply(joinLines([
                        msgs.join("\n"),
                        systemLine(sender + "이 구조 신호를 완성해 경기가 끝난다.")
                    ]));
                    finishTierGame(room, sender, "SOS", replier);
                    delete games[room]; return;
                }
            } else {
                // 오신호 - 리셋 + 상대 1턴간 3글자 이상 유도 불가
                state.signal_sequence = "";
                state.signal_cooldown = 1;
                oppState.no_long_yudo_turns = Math.max(oppState.no_long_yudo_turns || 0, 1);
                pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "오신호", "신호가 어긋나도 다시 시작한다.") + " 신호는 초기화되고 상대는 1턴 동안 3글자 이상 유도단어를 사용할 수 없다.");
            }
        }

        // 악당 [결계] 적중 갱신
        if (oppState && oppState.job === "악당" && oppState.barrier_turns > 0) {
            let additionalCount = word.length;
            let adds = ["ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
            for (let i = 0; i < additionalCount && oppState.barrier_chosungs.length < adds.length + 2; i++) {
                let nextIdx = oppState.barrier_chosungs.length - 2;
                if (nextIdx >= 0 && nextIdx < adds.length) {
                    oppState.barrier_chosungs.push(adds[nextIdx]);
                }
            }
        }

        // 혜성전사 [핼리 혜성] 결계 확장
        if (oppState && oppState.job === "혜성전사" && oppState.comet_barrier_turns > 0) {
            let cometAdds = ["ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
            for (let i = 0; i < word.length && oppState.comet_barrier_chosungs.length < cometAdds.length + 2; i++) {
                let cometIdx = oppState.comet_barrier_chosungs.length - 2;
                if (cometIdx >= 0 && cometIdx < cometAdds.length) {
                    oppState.comet_barrier_chosungs.push(cometAdds[cometIdx]);
                }
            }
        }

        // 수리사 [방탄]
        if (state.job === "수리사" && !isAbilityDisabled && state.bulletproof_cooldown === 0 && state.bulletproof_uses > 0) {
            state.bulletproof_uses -= 1;
            state.bulletproof_cooldown = 1;
            oppState.bulletproof_debuff_turns = 1;
            pushJob(msgs, state.job, getJobDialogue(state.job, "passive", "방탄", "상대의 공격을 튕겨내고 제약을 건다.") + " 상대는 1턴 동안 이을 음절의 연결 단어 수가 10개 이하인 단어를 사용할 수 없다.");
        }

        // ==========================
        // 턴 갱신 및 상태 감소
        // ==========================
        if (state.jojak_active > 0) state.jojak_active -= 1;
        if (state.jojak_cooldown > 0) state.jojak_cooldown -= 1;
        if (state.chotohwa_cooldown > 0) state.chotohwa_cooldown -= 1;
        if (state.juga_jojak_cooldown > 0) state.juga_jojak_cooldown -= 1;
        if (state.opcd_cooldown > 0) state.opcd_cooldown -= 1;
        if (state.make_cooldown > 0) state.make_cooldown -= 1;
        if (state.mine_cooldown > 0) state.mine_cooldown -= 1;
        if (state.detect_cooldown > 0) state.detect_cooldown -= 1;
        if (state.vault_cooldown > 0) state.vault_cooldown -= 1;
        if (state.lightning_cooldown > 0) state.lightning_cooldown -= 1;
        if (state.roar_cooldown > 0) state.roar_cooldown -= 1;
        if (state.capture_cooldown > 0) state.capture_cooldown -= 1;
        if (state.sixtyseven_cooldown > 0) state.sixtyseven_cooldown -= 1;
        if (state.apple_passive_cooldown > 0) state.apple_passive_cooldown -= 1;
        if (state.poetic_2_cooldown > 0) state.poetic_2_cooldown -= 1;
        if (state.poetic_allow_cooldown > 0) state.poetic_allow_cooldown -= 1;
        if (state.swallow_cooldown > 0) state.swallow_cooldown -= 1;
        if (state.void_cooldown > 0) state.void_cooldown -= 1;
        if (state.death_cooldown > 0) state.death_cooldown -= 1;
        if (state.calc_cooldown > 0) state.calc_cooldown -= 1;
        if (state.add_cooldown > 0) state.add_cooldown -= 1;
        if (state.correct_cooldown > 0) state.correct_cooldown -= 1;
        if (state.experiment_cooldown > 0) state.experiment_cooldown -= 1;
        if (state.dna_cooldown > 0) state.dna_cooldown -= 1;
        if (state.burger_cooldown > 0) state.burger_cooldown -= 1;
        if (state.fries_cooldown > 0) state.fries_cooldown -= 1;
        if (state.bonus_cooldown > 0) state.bonus_cooldown -= 1;
        if (state.robber_cooldown > 0) state.robber_cooldown -= 1;
        if (state.checkmate_cooldown > 0) state.checkmate_cooldown -= 1;
        if (state.rest_cooldown > 0) state.rest_cooldown -= 1;
        if (state.signal_cooldown > 0) state.signal_cooldown -= 1;
        if (state.rescue_cooldown > 0) state.rescue_cooldown -= 1;
        if (state.barrier_cooldown > 0) state.barrier_cooldown -= 1;
        if (state.distort_cooldown > 0) state.distort_cooldown -= 1;
        if (state.report_cooldown > 0) state.report_cooldown -= 1;
        if (state.stab_cooldown > 0) state.stab_cooldown -= 1;
        if (state.slice_cooldown > 0) state.slice_cooldown -= 1;
        if (state.gandhi_cooldown > 0) state.gandhi_cooldown -= 1;
        if (state.suppress_cooldown > 0) state.suppress_cooldown -= 1;
        if (state.star_cooldown > 0) state.star_cooldown -= 1;
        if (state.comet_passive_cooldown > 0) state.comet_passive_cooldown -= 1;
        if (state.bulletproof_cooldown > 0) state.bulletproof_cooldown -= 1;
        if (state.repair_cooldown > 0) state.repair_cooldown -= 1;
        if (state.radiation_cooldown > 0) state.radiation_cooldown -= 1;
        if (state.gongcheo_cooldown > 0) state.gongcheo_cooldown -= 1;

        if (state.disabled_turns > 0) state.disabled_turns -= 1;
        if (state.no_yudo_turns > 0) state.no_yudo_turns -= 1;
        if (state.no_hanbang_turns > 0) state.no_hanbang_turns -= 1;
        if (state.no_du_eum_turns > 0) state.no_du_eum_turns -= 1;
        if (state.only_even_turns > 0) state.only_even_turns -= 1;
        if (state.only_odd_turns > 0) state.only_odd_turns -= 1;
        if (state.only_length_2_turns > 0) state.only_length_2_turns -= 1;
        if (state.no_length_2_turns > 0) state.no_length_2_turns -= 1;
        if (state.only_root_turns > 0) state.only_root_turns -= 1;
        if (state.last_route_only_turns > 0) state.last_route_only_turns -= 1;
        if (state.no_all_batchim_turns > 0) state.no_all_batchim_turns -= 1;
        if (state.limited_length > 0) state.limited_length = 0;
        if (state.target_active_turns > 0) state.target_active_turns -= 1;
        if (state.patient_no_kill_turns > 0) state.patient_no_kill_turns -= 1;
        if (state.barrier_turns > 0) state.barrier_turns -= 1;
        if (state.comet_barrier_turns > 0) {
            state.comet_barrier_turns -= 1;
            if (state.comet_barrier_turns === 0) cometBarrierEndedThisTurn = true;
        }
        if (state.absolutely_disabled > 0) state.absolutely_disabled -= 1;
        if (state.bulletproof_debuff_turns > 0) state.bulletproof_debuff_turns -= 1;
        if (state.report_turns > 0) state.report_turns -= 1;
        if (state.apple_debuff_turns > 0) state.apple_debuff_turns -= 1;
        if (state.min_length > 0) state.min_length = 0;
        if (state.no_long_yudo_turns > 0) state.no_long_yudo_turns -= 1;
        if (state.knight_lock_turns > 0) state.knight_lock_turns -= 1;
        if (state.knight_silence_turns > 0) state.knight_silence_turns -= 1;

        if (cometBarrierEndedThisTurn) {
            state.comet_barrier_turns = 0;
            state.comet_barrier_chosungs = [];
            state.comet_passive_cooldown = 3;
        }

        if (state.dino_swallowed) state.dino_swallowed = false;
        if (state.tail_active) state.tail_active = false;
        if (state.slice_active) state.slice_active = false;
        if (state.exchange_active) state.exchange_active = false;
        if (state.fission_active) {
            state.fission_active = false;
            state.fission_syllables = [];
        }

        // 마하트마간디 비폭력: 능력 사용 후 다음 턴 스택 증가 (모든 직업 공통)
        if (state.used_active_this_turn) {
            if (oppState && oppState.job === "마하트마간디" && !oppState.lost_abilities) {
                oppState.gandhi_stacks++;
                pushJob(msgs, oppState.job, getJobDialogue(oppState.job, "passive", "비폭력 능력", "능력 사용까지 모두 스택으로 바꿔 둔다.") + " 현재 스택은 " + oppState.gandhi_stacks + "이다.");
                if (oppState.gandhi_stacks >= 3) {
                    replier.reply(joinLines([
                        msgs.join("\n"),
                        systemLine(game.players[oppIndex] + "의 비폭력 스택이 3에 도달해 경기가 끝난다.")
                    ]));
                    finishTierGame(room, game.players[oppIndex], "비폭력", replier);
                    delete games[room]; return;
                }
            }
            state.used_active_this_turn = false;
        }

        // ==========================
        game.used.add(word);
        game.history.push(word);
        let last = word[word.length - 1];
        game.lastLetter.s1 = applyDuEum(last);
        game.lastLetter.s2 = last;
        game.currentTurnIndex = oppIndex;
        game.lastPlayTime = Date.now();
        game.turnCount = Math.floor(game.history.length / 2) + 1;

        if (msgs.length > 0) replier.reply(msgs.join("\n"));
        replier.reply(buildStatusMsg(game));
    }

}

function onStartCompile() {
    safeGc();
}
