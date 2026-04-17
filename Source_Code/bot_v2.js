/* ========================================================
   채린룰 능력 끝말잇기 봇 (API v2 / 레거시 미사용 버전)
   ======================================================== */

const bot = BotManager.getCurrentBot();

// --- [설정 영역] ---
let PREFIX = "1";       // 일반 명령어 접두사 (채린룰 기본)
let INPUT_PFX = "0";    // 단어 입력 접두사
let ADMIN_PFX = ".dev";  // 관리자 명령어 접두사
let games = {};
let WORD_SET = null; 
let KILL_SET = null;
let nextw = "";
let isOn = true;

const FULL_VIEW = "\u200b".repeat(500); // 전체보기용 특수공백

let ROUTESYL_SET = null;
let INTENDSYL_SET = null;
let KILLSYL_SET = null;

const SD_PATH = android.os.Environment.getExternalStorageDirectory().getAbsolutePath();
const FILE_PATH = SD_PATH + "/msgbotr/wordlist.json";
const KILL_FILE_PATH = SD_PATH + "/msgbotr/killword.json"; // (기존 한방/유도 호환용, 가급적 diesyl 엔진 사용)
const DIESYL_FILE_PATH = SD_PATH + "/msgbotr/diesyl.json"; // API v2 및 레거시에 적용할 새 규칙 엔진

/** 단어 데이터 로드 (diesyl 포함) */
function loadHeavyWords() {
    try {
        const file = new java.io.File(FILE_PATH);
        if (!file.exists()) return "파일 없음: " + FILE_PATH;
        const fis = new java.io.FileInputStream(file);
        const br = new java.io.BufferedReader(new java.io.InputStreamReader(fis, "UTF-8"));
        const sb = new java.lang.StringBuilder();
        let line;
        while ((line = br.readLine()) !== null) sb.append(line);
        br.close();
        
        WORD_SET = new Set(JSON.parse(sb.toString())); 
        
        // Load legacy KILL_SET just in case
        const kfile = new java.io.File(KILL_FILE_PATH);
        if (kfile.exists()) {
            const kfis = new java.io.FileInputStream(kfile);
            const kbr = new java.io.BufferedReader(new java.io.InputStreamReader(kfis, "UTF-8"));
            const ksb = new java.lang.StringBuilder();
            let kline;
            while ((kline = kbr.readLine()) !== null) ksb.append(kline);
            kbr.close();
            KILL_SET = new Set(JSON.parse(ksb.toString()));
        } else {
            KILL_SET = new Set();
        }

        // Load Diesyl sets
        const dfile = new java.io.File(DIESYL_FILE_PATH);
        if (dfile.exists()) {
            const dfis = new java.io.FileInputStream(dfile);
            const dbr = new java.io.BufferedReader(new java.io.InputStreamReader(dfis, "UTF-8"));
            const dsb = new java.lang.StringBuilder();
            let dline;
            while ((dline = dbr.readLine()) !== null) dsb.append(dline);
            dbr.close();
            const dj = JSON.parse(dsb.toString());
            ROUTESYL_SET = new Set(dj.Routesyl || []);
            INTENDSYL_SET = new Set(dj.Intendsyl || []);
            KILLSYL_SET = new Set(dj.Killsyl || []);
        } else {
            ROUTESYL_SET = new Set();
            INTENDSYL_SET = new Set();
            KILLSYL_SET = new Set();
        }

        java.lang.System.gc(); 
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

/** 음절 단위 분리기 */
function decomposeSyllable(char) {
    const hangulBase = 0xac00;
    const choseongList = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    const jungseongList = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
    const jongseongList = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    
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
    const choseongList = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    const jungseongList = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
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
    let state = { job: job, lost_abilities: false, disabled_turns: 0, no_yudo_turns: 0, no_hanbang_turns: 0, no_du_eum_turns: 0, only_even_turns: 0, only_odd_turns: 0, only_length_2_turns: 0, limited_length: 0, min_length: 0, no_long_yudo_turns: 0, used_active_this_turn: false };
    
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
    // 수리사
    else if (job === "수리사") {
        state.bulletproof_cooldown = 0;
        state.repair_cooldown = 0; state.repair_uses = 0; state.repair_active = false;
    }
    
    return state;
}

const ALL_JOBS = ["해커", "투자자", "환자", "수집가", "감시자", "뜀틀선수", "전우치", "기관사", "늑대인간", "시프터", "비밀요원", "67", "사과", "시인", "공룡", "마법사", "사신", "수학자", "생존자", "악당", "기자", "검객", "마하트마간디", "은하계전사", "수리사"];



function nextCharForWord(game) {
    if (game.history.length === 0) return "자유";
    return game.lastLetter.s1 !== game.lastLetter.s2 ? 
                   game.lastLetter.s2 + "(" + game.lastLetter.s1 + ")" : game.lastLetter.s2;
}

// --- 직업 정보 사전 (1직업선택 커맨드용) ---
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
    "생존자": "[ 채린룰 생존자 직업 정보 ]\n\n< 신호 > - 패시브(자동 시전 능력) | 쿨타임 1턴\n\n2글자 단어를 입력하면 [ · ] 모스부호 신호를 보냅니다.\n3글자 이상의 단어를 입력하면 [ - ] 모스부호 신호를 보냅니다.\n전체 모스부호 신호가 [ · · · - - - · · · - · - · - - ]가 되면 'SOS!' 신호가 완성되어 게임에서 즉시 승리합니다.\n신호를 잘못 입력하면 그 신호는 취소되지만, 상대방이 1턴간 3글자 이상의 유도단어를 사용할 수 없도록 합니다.\n\n\n< 긴급 구조 > - 쿨타임 7턴 | 2회용\n\n게임에서 사용된 단어 중 맨처음 2개의 단어를 제외한 전체 단어를 한 묶음으로 하여 뒤집고, 뒤집은 단어를 기준으로 게임을 진행합니다.\n[기차 차표 표범 범죄 죄인]이면 [인죄 죄범 범표]와 같이 뒤집힙니다.\n긴급 구조 발동 시 모든 디버프를 제거하지만, 1턴간 한방단어나 유도단어를 사용할 수 없습니다.\n한방단어나 유도단어를 받았을 때만 사용 가능합니다.",
    "악당": "[ 채린룰 악당 직업 정보 ]\n\n< 결계 > - 쿨타임 5턴 | 4회용\n\n능력 사용 시 마지막에 사용된 단어의 글자 수만큼의 턴간 지속되는 결계를 생성합니다.\n결계가 생성되면 결계 초성이 [ㄱㄴ]으로 설정되며, 상대방은 결계가 지속되는 동안 끝음절에 결계 초성이 포함된 단어를 사용할 수 없습니다.\n또한, 결계가 지속되는 동안 상대방이 입력하는 단어의 글자 수만큼 결계 초성이 늘어납니다.\n추가되는 순서는 [ㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ]입니다.\n결계 초성이 [ㅎ]까지 도달하면 결계가 끝날 때까지 더 이상 변동되지 않습니다.\n\n\n< 왜곡 > - 쿨타임 1턴 | 2회용\n\n결계 시전 중에만 사용할 수 있습니다.\n사용 즉시 1턴간 이때까지 진행된 결계 초성을 모두 왜곡합니다.\n[ㄱㄴㄷㄹ]인 경우, [ㅎㅍㅌㅋ]로 왜곡됩니다.\n왜곡된 결계 초성이 4개 이상인 경우 상대방은 1턴간 능력을 사용할 수 없습니다.",
    "기자": "[ 채린룰 기자 직업 정보 ]\n\n< 거짓 보도 > - 쿨타임 3턴 | 4회용\n\n1턴간 보도를 실시하며, 상대방이 보도 중에 한방단어나 유도단어를 사용하면 마지막 음절을 '삐'로 변경 후 상대방이 1턴간 능력과 유도단어를 사용하지 못하도록 합니다.\n상대방은 보도 중엔 패시브와 능력을 사용할 수 없으며, 두음법칙도 제한됩니다.",
    "검객": "[ 채린룰 검객 직업 정보 ]\n\n< 찌르기 > - 쿨타임 5턴 | 2회용\n\n상대방이 1턴간 패시브와 능력을 사용할 수 없게 합니다.\n또한, 1턴간 두음법칙을 사용할 수 없도록 합니다.\n5턴부터 사용 가능합니다.\n\n\n< 가르기 > - 쿨타임 3턴 | 3회용\n\n능력 사용 직전에 받은 단어를 반으로 가르고 단어를 이어갑니다.\n홀수 단어를 가르면 초성과 종성, 종성이 없으면 초성과 중성 기준으로 갈라집니다.(속 -> 소/ㄱ, 누 -> ㄴ/ㅜ)\n가른 직후 두음법칙은 적용되지 않으며, 현재 턴이 12턴 이상이 아니라면 가른 직후 한방단어와 유도단어를 사용할 수 없습니다.",
    "마하트마간디": "[ 채린룰 마하트마간디 직업 정보 ]\n\n< 비폭력 > - 패시브(자동 시전 능력) | 쿨타임 1턴\n\n상대방이 한방단어나 유도단어를 사용할 때마다 비폭력 스탯이 1회 추가됩니다.\n상대방이 능력을 사용하고 차례가 지나면 비폭력 스탯이 1회 추가됩니다.\n비폭력 스탯이 4회가 되면 개발자를 협박하여 게임을 즉시 승리로 종료합니다.\n패시브 불가 효과를 무시합니다.\n\n\n< 억제 > - 쿨타임 3턴\n\n비폭력 스탯을 1회 사용하여 상대방이 1턴간 유도단어를 사용할 수 없게 합니다.",
    "은하계전사": "[ 채린룰 은하계전사 직업 정보 ]\n\n< 별인 듯 달 아닌 별 > - 패시브(자동 시전 능력) | 쿨타임 1턴\n\n[별] 또는 [달]이 포함된 단어를 사용하면 상대방은 2턴간 끝음절이 루트음절인 단어만 사용 가능하고, 패시브와 능력을 사용할 수 없습니다.\n[별] 또는 [달]이 포함된 단어를 3번 이상 사용할 경우, 끝음절이 [벨]으로 변경됩니다.\n16턴 이전에 [벨]을 한 번이라도 주게 되면 16턴 이상이 되었을 때 단 한 번, 사용하는 단어의 끝음절이 [볠]으로 변하게 되며, 상대방은 무기한으로 끝음절 초성이 [ㅅㅍㄴㅂ] 중 하나인 단어만 사용 가능합니다.(이때, 더 이상 이 패시브는 발동하지 않습니다.)",
    "수리사": "[ 채린룰 수리사 직업 정보 ]\n\n< 방탄 > - 패시브(자동 시전 능력) | 쿨타임 1턴 | 13회용\n\n단어 입력 시 상대방은 1턴간 끝음절로 시작하는 단어가 10개 이하인 단어를 사용할 수 없습니다.\n\n\n< 수리 > - 쿨타임 6턴 | 4회용\n\n현재 이을 음절의 중성을 애매하게 수리합니다.\n수리 후 두음법칙을 사용할 수 있지만, 유도단어는 사용할 수 없습니다.\n[ㅏㅑㅓㅕㅣ] <-> [ㅜㅠㅗㅛㅡ]"
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
                "비폭력 스탯이 4회가 되면 개발자를 협박하여 게임을 즉시 승리로 종료합니다.\n" +
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

        } else if (state.job === "수리사") {
            abilities.push(
                "< 방탄 > - 패시브(자동 시전 능력) | 쿨타임 1턴" + (state.bulletproof_cooldown > 0 ? " | " + state.bulletproof_cooldown + "턴 남음" : "") + " | 13회용\n" +
                "단어 입력 시 상대방은 1턴간 끝음절로 시작하는 단어가 10개 이하인 단어를 사용할 수 없습니다."
            );
            abilities.push(
                "< 수리 > - 쿨타임 6턴 | " + (4 - state.repair_uses) + "회 남음" + (state.repair_cooldown > 0 ? " | " + state.repair_cooldown + "턴 남음" : "") + "\n" +
                "현재 이을 음절의 중성을 애매하게 수리합니다.\n" +
                "수리 후 두음법칙을 사용할 수 있지만, 유도단어는 사용할 수 없습니다.\n" +
                "[ㅏㅑㅓㅕㅣ] <-> [ㅜㅠㅗㅛㅡ]"
            );
        }

        // --- 공통 디버프 ---
        if (state.disabled_turns > 0) debuff.push("능력/패시브 상실 : " + state.disabled_turns + "턴");
        if (state.lost_abilities) debuff.push("능력 영구 상실");
        if (state.no_yudo_turns > 0) debuff.push("유도단어 불가 : " + state.no_yudo_turns + "턴");
        if (state.no_hanbang_turns > 0) debuff.push("한방단어 불가 : " + state.no_hanbang_turns + "턴");
        if (state.no_du_eum_turns > 0) debuff.push("두음법칙 불가 : " + state.no_du_eum_turns + "턴");
        if (state.only_even_turns > 0) debuff.push("짝수 글자 단어만 허용 : " + state.only_even_turns + "턴");
        if (state.only_length_2_turns > 0) debuff.push("2글자 단어만 허용 : " + state.only_length_2_turns + "턴");
        if (state.limited_length > 0) debuff.push(state.limited_length + "글자 이하 단어만 허용");
        if (state.min_length > 0) debuff.push(state.min_length + "글자 이상 단어만 허용 (사신 사형 선고)");
        if (state.no_long_yudo_turns > 0) debuff.push("3글자 이상 유도단어 불가 : " + state.no_long_yudo_turns + "턴 (생존자 오신호)");
        if (state.target_active_turns > 0) debuff.push("비밀요원 타깃 포착 중 (" + state.target_active_turns + "턴 남음, 5글자 이상 금지)");
        if (state.apple_debuff_turns > 0) debuff.push("사과 디버프 : " + state.apple_debuff_turns + "턴 (3글자 이상 한방단어 & 5글자 이상 유도단어 불가)");
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
            etc.push("비폭력 스택 : " + state.gandhi_stacks + " / 4");
        }
        if (state.job === "은하계전사") {
            etc.push("별/달 스택 : " + state.star_stacks + "회" + (state.star_permanent_done ? " | [벨] 고정 완료" : "") + (state.star_ult_used ? " | [볠] 궁극 사용" : ""));
        }
        if (state.job === "사신") {
            etc.push("처형 수 : " + state.execution_count + " (4 이하 시 사형 선고로 즉시 승리)");
        }
        if (state.job === "수학자") {
            etc.push("수식 결과 : " + state.math_result + " (20 도달 시 계산 능력으로 승리)");
        }
        if (state.job === "생존자") {
            let sigDisp = state.signal_sequence && state.signal_sequence.length > 0 ? state.signal_sequence : "없음";
            etc.push("SOS 신호 진행 : [" + sigDisp + "] (목표: · · · - - - · · · - · - · - -)");
        }
        if (state.job === "비밀요원") {
            etc.push("현재 타깃 : [" + (state.targets && state.targets.length > 0 ? state.targets.join(", ") : "없음") + "]");
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
              FULL_VIEW + "\n" +
              "차례 : " + currentPlayer + " [" + curState.job + "]\n\n\n" +
              "< 서로의 상태 >\n\n" +
              makePlayerInfo(currentPlayer, curState, nxtState) + "\n\n\n\n" +
              makePlayerInfo(nextPlayer, nxtState, curState);
              
    return msg;
}



/** API v2 메시지 수신 이벤트 핸들러 */
bot.addListener(Event.MESSAGE, function(event) {
    let room = event.room;
    let msg = event.content;
    let sender = event.author.name;
    let isGroupChat = event.isGroupChat;
    
    // API v2 메서드 매핑
    let replier = {
        reply: function(text) {
            event.reply(text);
        }
    };

    // --- (이하 기존 response 본문 시작) ---
    // 관리자 해쉬 체크 설정
    let senderHash = String(java.lang.String(event.author.avatar.getBase64()).hashCode());
    let isAdmin = (senderHash === "1003380129");

    if (isAdmin) {
        if(msg === ADMIN_PFX + " switch on") {
            isOn = true;
            replier.reply("1:On");
        }
        else if(msg === ADMIN_PFX + " switch off") {
            isOn = false;
            replier.reply("1:Off");
        }
    }
    if(!(isOn)) return;
    if(!(isGroupChat)) return;
    let game = games[room];

    // --- 도움말 ---
    if (msg === "%도움말" || msg === "%ㄷㅇㅁ") {
        replier.reply(
            "--- 채린룰 끝말잇기 도움말 ---\n" +
            PREFIX + "채린 : 참가 및 시작\n" +
            PREFIX + "직업 [직업명] : 게임 참가 시 직업 선택\n" +
            PREFIX + "상태 : 현황 확인\n" +
            PREFIX + "무르기 [단어] : 무르기 요청\n" +
            PREFIX + "무효 : 무효 요청\n" +
            PREFIX + "바꾸기 : 첫 단어 입장 바꾸기 요청\n" +
            PREFIX + "킥 : 잠수 유저 킥\n" +
            "2[능력명] : 능력 사용 (예: 2조작)\n" +
            INPUT_PFX + "[단어] : 단어 입력\n" +
            "ㅈㅈ : 기권 및 종료"
        );
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
                    replier.reply(sender + "님의 생존이 확인되어 강퇴가 취소되었습니다.");
                } else {
                    replier.reply("잠수 제한시간(15초)을 초과하여 " + sender + "님이 강퇴되었습니다.");
                    let winner = game.players.find(p => p !== sender);
                    replier.reply("게임 종료\n승자: " + winner);
                    delete games[room];
                    return;
                }
            } else if (msg === PREFIX + "킥" || msg === PREFIX + "ㅋ" || (now - game.kickVote.startTime > 15000 && (msg.startsWith(INPUT_PFX) || msg.startsWith(PREFIX)))) {
                if (now - game.kickVote.startTime > 15000) {
                    replier.reply("제한시간(15초)이 경과되어 " + game.kickVote.target + "님이 잠수로 강퇴되었습니다.");
                    let winner = game.players.find(p => p !== game.kickVote.target);
                    replier.reply("게임 종료\n승자: " + winner);
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
                replier.reply(target + "님이 3시간 이상 잠수하여 즉시 강퇴되었습니다.");
                let winner = game.players.find(p => p !== target);
                replier.reply("게임 종료\n승자: " + winner);
                delete games[room];
                return;
            } else if (timeDiff >= 2 * 60 * 1000) { // 2분
                game.kickVote = { target: target, startTime: now };
                replier.reply("잠수로 판정되어 1킥이 발동되었습니다.\n" + target + "님은 15초 내로 아무 채팅이나 치지 않으면 패배합니다.");
                return;
            } else {
                { replier.reply("아직 잠수(2분 초과) 상태가 아닙니다."); return; }
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
                    removed.forEach(w => game.used.delete(w));
                    
                    let targetWord = game.targetWord;
                    let lastChar = targetWord[targetWord.length - 1];
                    game.lastLetter.s1 = applyDuEum(lastChar);
                    game.lastLetter.s2 = lastChar;
                
                    game.currentTurnIndex = (game.firstTurnIndex + game.history.length) % 2;
                    game.turnCount = Math.floor(game.history.length / 2) + 1;
                    
                    replier.reply(buildStatusMsg(game));
                } else if (game.voteType === "무효") {
                    replier.reply("무효 요청이 동의되어 이번 게임이 없던 경기로 취소되었습니다.");
                    delete games[room];
                    return;
                }
                
                game.isWaitingVote = false;
                game.targetWord = null;
                game.requester = null;
                game.voteType = null;
            }
            else if (msg === PREFIX + "거절" || msg === PREFIX + "ㄱㅈ") {
                replier.reply(game.voteType + " 요청이 거절되었습니다. 게임을 계속합니다.");
                game.isWaitingVote = false;
                game.targetWord = null;
                game.requester = null;
                game.voteType = null;
            }
            return;
        }
        else if (msg.startsWith(PREFIX) || msg.startsWith(INPUT_PFX)) {
            { replier.reply("현재 " + game.voteType + " 투표 중입니다. " + PREFIX + "동의 또는 " + PREFIX + "거절을 먼저 입력하세요."); return; }
        }
    }

    // --- 무효 요청 ---
    if (msg === PREFIX + "무효" || msg === PREFIX + "ㅁㅎ") {
        if (!game || !game.started || game.phase !== "playing") return;
        game.isWaitingVote = true;
        game.voteType = "무효";
        game.requester = sender;
        replier.reply(sender + "님이 무효를 요청했습니다.\n상대방은 " + PREFIX + "동의 또는 " + PREFIX + "거절을 입력하세요.");
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
        
        replier.reply(sender + "님이 '" + targetWord + "' 시점으로 무르기를 요청했습니다.\n상대방은 " + PREFIX + "동의 또는 " + PREFIX + "거절을 입력하세요.");
        return;
    }

    // --- 입장 바꾸기 ---
    if (msg === PREFIX + "바꾸기" || msg === PREFIX + "ㅂㄲㄱ") {
        if (!game || !game.started || game.phase !== "playing") return;
        if (game.players.includes(sender)) {
            if (game.history.length === 1 && sender !== game.players[game.firstTurnIndex]) {
                game.firstTurnIndex = game.players.indexOf(sender);
                game.currentTurnIndex = (game.firstTurnIndex + 1) % 2; // 차례가 원래 첫 대상자에게 넘어감
                replier.reply(sender + "님이 '" + game.history[0] + "' 단어를 빼앗아 처음 입장을 가져갔습니다.\n다음 차례: " + game.players[game.currentTurnIndex]);
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
            WORD_SET.add(word);
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

    // --- 직업 정보 조회 ---
    if (msg.startsWith(PREFIX + "직업선택 ")) {
        let jobName = msg.slice((PREFIX + "직업선택 ").length).trim();
        if (JOB_INFO[jobName]) {
            replier.reply(JOB_INFO[jobName]);
        } else {
            replier.reply("[ 직업 정보 없음 ]\n\"" + jobName + "\" 직업을 찾을 수 없습니다.\n사용 가능한 직업: 해커, 투자자, 환자, 수집가, 감시자, 뜀틀선수, 전우치, 기관사, 늑대인간, 시프터, 비밀요원, 67, 사과, 시인, 공룡, 마법사, 사신, 수학자, 생존자, 악당, 기자, 검객, 마하트마간디, 은하계전사, 수리사");
        }
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
        replier.reply(sender + " 참가 (" + game.players.length + "/2)");
        
        if (game.players.length === 2) {
            game.phase = "job_selection";
            game.started = true;
            replier.reply("게임 대기열 충족! 직업을 선택해주세요.\n입력 방법: " + PREFIX + "직업 해커 / " + PREFIX + "직업 투자자\n(현재 등록 직업: 25개 전체 등록 완료!)");
        }
        return;
    }

    // --- 밴픽 (1밴 직업1 직업2 ... 최대 6개, 한 번에 처리) ---
    if ((msg.startsWith(PREFIX + "밴 ") || msg === PREFIX + "밴") && game && game.phase === "job_selection" && game.banPhase) {
        if (sender !== game.firstPicker) { replier.reply("[밴픽] 밴픽 권한은 먼저 직업을 선택한 분에게 있습니다."); return; }

        let banList = msg.slice(PREFIX.length + 1).trim().split(/\s+/).filter(j => j.length > 0);
        let myJob = game.playerStates[sender].job;
        let errors = [];
        let added = [];

        for (let banJob of banList) {
            if (added.length >= 6) { errors.push("최대 6개까지만 밴 가능 (이후 무시됨)"); break; }
            if (!ALL_JOBS.includes(banJob)) { errors.push("없는 직업: " + banJob); continue; }
            if (banJob === myJob) { errors.push("자신의 직업은 밴 불가: " + banJob); continue; }
            if (added.includes(banJob)) { errors.push("중복: " + banJob); continue; }
            added.push(banJob);
        }

        game.bannedJobs = added;
        game.banPhase = false;
        let otherPlayer = game.players.find(p => p !== sender);
        let bannedStr = added.length > 0 ? "[" + added.join(", ") + "]" : "없음";
        let availStr = ALL_JOBS.filter(j => !added.includes(j)).join(", ");
        let errStr = errors.length > 0 ? "\n⚠ " + errors.join(" / ") : "";
        replier.reply("[밴픽] 완료!" + errStr + "\n밴된 직업: " + bannedStr + "\n\n" +
            otherPlayer + "님은 이제 직업을 선택하세요.\n선택 가능 직업: [" + availStr + "]");
        return;
    }

    // --- 직업 선택 ---
    if ((msg.startsWith(PREFIX + "직업 ") || msg.startsWith(PREFIX + "ㅈㅇ ")) && game && game.phase === "job_selection") {
        if (!game.players.includes(sender)) return;
        let job = msg.replace(PREFIX + "직업 ", "").replace(PREFIX + "ㅈㅇ ", "").trim();
        if (job === "ㅎㅋ") job = "해커";
        if (job === "ㅌㅈㅈ") job = "투자자";
        
        if (!ALL_JOBS.includes(job)) { replier.reply("존재하지 않거나 선택할 수 없는 직업입니다."); return; }
        if (game.playerStates[sender]) { replier.reply("이미 직업을 선택하셨습니다."); return; }

        // 밴픽 단계 중 두 번째 플레이어가 시도한 경우
        if (game.banPhase && sender !== game.firstPicker) {
            replier.reply("[밴픽] 아직 밴 단계입니다. " + game.firstPicker + "님이 1밴 [직업명들]을 입력해야 합니다.\n예) 1밴 해커 기관사 사신\n(밴 없이 진행하려면: 1밴)");
            return;
        }
        // 두 번째 플레이어의 직업이 밴됐는지 확인
        if (sender !== game.firstPicker && game.bannedJobs.includes(job)) {
            replier.reply("[밴픽] '" + job + "'은 밴된 직업입니다.\n밴 목록: [" + game.bannedJobs.join(", ") + "]\n선택 가능 직업: [" + ALL_JOBS.filter(j => !game.bannedJobs.includes(j)).join(", ") + "]");
            return;
        }

        game.playerStates[sender] = initJobState(job);

        // 첫 번째 직업 선택자 → 밴픽 시작
        if (!game.firstPicker) {
            game.firstPicker = sender;
            game.banPhase = true;
            replier.reply(sender + "님 -> [" + job + "] 선택 완료\n\n" +
                "[밴픽] 상대방의 직업을 최대 6개까지 밴할 수 있습니다.\n" +
                "명령어: 1밴 직업1 직업2 직업3 ...\n" +
                "예시:   1밴 해커 기관사 사신\n" +
                "(밴 없이 진행: 1밴)\n\n" +
                "25개 직업: [" + ALL_JOBS.join(", ") + "]");
            return;
        }

        replier.reply(sender + "님 -> [" + job + "] 선택 완료");


        if (Object.keys(game.playerStates).length === 2) {
            game.phase = "playing";
            game.lastPlayTime = Date.now();
            let p1 = game.players[0];
            let p2 = game.players[1];
            let p1_job = game.playerStates[p1].job;
            let p2_job = game.playerStates[p2].job;
            let startMsg = p1 + " 님과 " + p2 + " 님의 채린룰 끝말잇기가 시작되었습니다.\n\n" +
                "{ " + p1 + " : " + p1_job + " }\n" +
                "{ " + p2 + " : " + p2_job + " }\n" +
                FULL_VIEW + "\n\n" +
                "시작은 아무나, 단어 입력은 ‘0(단어)’\n" +
                "예시 :: ‘0기차’\n\n" +
                "능력 사용 - 2(능력명)\n\n\n" +
                "< 부가 기능 >\n" +
                "현황 확인 - 1상태\n" +
                "무효 요청 - 1무효\n" +
                "무르기 요청 - 1무르기 (단어 또는 횟수)\n" +
                "입장 바꾸기 요청(직업 제외) - 1바꾸기\n" +
                "기권 - ㅈㅈ\n\n" +
                "잠수 발견 시 아무나 ‘1킥’ 입력\n\n\n" +
                "< 채린룰 설명 보기 >\n\n" +
                "① (구)표준국어대사전에 등재된 2글자 이상인 명사 단어만 사용할 수 있습니다.\n\n" +
                "② 두음법칙은 표준두음법칙을 적용합니다.\n\n" +
                "③ 첫 수에는 한방단어나 유도단어를 사용할 수 없습니다.\n\n" +
                "④ 각자의 직업을 선택하면 시작되며, 패시브와 능력을 사용하면서 진행합니다.\n\n" +
                "◆ 표준두음법칙 ◆\n" +
                "라(나), 래(내), 로(노), 루(누), 르(느), 뢰(뇌), 랴(야), 럐(얘), 료(요), 류(유), 리(이), 례(예), 녀(여), 뇨(요), 뉴(유), 니(이)\n" +
                "* 표준두음법칙은 받침에 영향받지 않음";
            replier.reply(startMsg);
        }
        return;
    }

    // --- 종료 및 최종 기보 ---
    if (msg === "ㅈㅈ") {
        if (!game || !game.players.includes(sender)) return;
        if (game.phase === "playing" || game.phase === "job_selection") {
            let winner = game.players.find(p => p !== sender);
            replier.reply("기권으로 게임 종료\n승자: " + winner + "\n ----------------\n" + game.history.join(" "));
        } else {
            replier.reply("게임 대기 취소됨");
        }
        delete games[room];
    }

        // --- 능력 사용 (2능력명) ---
    if (msg.startsWith("2") && msg.length > 1) {
        if (!game || game.phase !== "playing" || !game.players.includes(sender)) return;
        let abilityStr = msg.substring(1).trim();
        let abilityWords = abilityStr.split(" ");
        let ability = abilityWords[0];
        if (abilityWords.length > 1 && (ability === "주가" || ability === "거짓" || ability === "시적" || ability === "꼬리" || ability === "사형" || ability === "긴급" || ability === "허들")) {
            ability = abilityWords[0] + " " + abilityWords[1]; // 두 어절 스킬 이름 처리
            abilityWords.shift();
        }
        let targetParam = abilityWords.length > 1 ? abilityWords.slice(1).join(" ") : null;

        let state = game.playerStates[sender];
        let isAbilityDisabled = state.disabled_turns > 0 || state.lost_abilities;
        let oppIndex = (game.players.indexOf(sender) + 1) % 2;
        let oppState = game.playerStates[game.players[oppIndex]];

        if (state.job === "해커") {
            if (ability === "조작" && !isAbilityDisabled) {
                if (state.jojak_uses >= 3) { replier.reply("조작 능력을 모두 사용했습니다."); return; }
                if (state.jojak_cooldown > 0) { replier.reply("조작 쿨타임입니다. (" + state.jojak_cooldown + "턴 남음)"); return; }
                state.jojak_uses += 1; state.jojak_cooldown = 4; state.jojak_active = 2;
                replier.reply("[해커] <조작> 발동!\n- 이후 2턴간 이미 사용했던 단어를 재사용할 수 있습니다.");
            } else if (ability === "복제" && !isAbilityDisabled) {
                if (game.turnCount < 7) { replier.reply("복제 능력은 7턴 이후부터 사용할 수 있습니다."); return; }
                if (state.bokje_uses >= 1) { replier.reply("복제 능력을 모두 사용했습니다."); return; }
                state.bokje_uses += 1;
                let myDebuffs = {
                    disabled_turns: state.disabled_turns, no_yudo_turns: state.no_yudo_turns, no_hanbang_turns: state.no_hanbang_turns,
                    no_du_eum_turns: state.no_du_eum_turns, only_even_turns: state.only_even_turns, only_odd_turns: state.only_odd_turns,
                    only_length_2_turns: state.only_length_2_turns, limited_length: state.limited_length, target_active_turns: state.target_active_turns
                };
                Object.assign(oppState, myDebuffs);
                Object.keys(myDebuffs).forEach(k => state[k] = 0);
                replier.reply("[해커] <복제> 발동!\n- 내 모든 디버프를 제거하고 상대방에게 전송했습니다.");
            } else if (ability === "초토화" && !isAbilityDisabled) {
                if (game.turnCount < 7) { replier.reply("초토화 능력은 7턴 이후부터 사용할 수 있습니다."); return; }
                if (state.chotohwa_uses >= 2) { replier.reply("초토화 능력을 모두 사용했습니다."); return; }
                if (state.chotohwa_cooldown > 0) { replier.reply("초토화 쿨타임입니다. (" + state.chotohwa_cooldown + "턴 남음)"); return; }
                state.chotohwa_uses += 1; state.chotohwa_cooldown = 7; state.chotohwa_active = 1; 
                replier.reply("[해커] <초토화> 예약 발동!\n- 1턴 내 상대방이 4글자 이상의 단어를 사용하면 모든 능력을 잃습니다.");
            }
        }
        else if (state.job === "투자자" && !isAbilityDisabled) {
            if (ability === "주가 조작") {
                if (state.juga_jojak_uses >= 2) { replier.reply("주가 조작를 모두 사용했습니다."); return; }
                if (state.juga_jojak_cooldown > 0) { replier.reply("주가 조작 쿨타임입니다."); return; }
                state.juga_jojak_uses += 1; state.juga_jojak_cooldown = 7; state.juga_jojak_active = true;
                replier.reply("[투자자] <주가 조작> 예약 발동!\n- 다음 턴 상대방이 제출하는 단어는 길이 상관없이 무조건 주가를 폭락시킵니다.");
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
                replier.reply("[수집가] 추가단어 제작 성공! 이제 '" + targetParam + "' 단어를 사용할 수 있습니다.");
            } else if (ability === "채굴") {
                if (state.mine_uses >= 2) { replier.reply("채굴을 모두 사용했습니다."); return; }
                if (state.mine_cooldown > 0) { replier.reply("채굴 쿨타임입니다."); return; }
                state.mine_uses++; state.mine_cooldown = 6; state.mine_active = 1;
                replier.reply("[수집가] 채굴 발동! 1턴간 상대방이 사용한 단어의 모든 음절을 수집합니다.");
            }
        }
        else if (state.job === "환자") {
            if (ability === "환각증" && !isAbilityDisabled) {
                if (game.turnCount < 7) { replier.reply("환각증 능력은 7턴 이후부터 사용할 수 있습니다."); return; }
                if (state.hallucination_uses >= 1) { replier.reply("환각증을 모두 사용했습니다."); return; }
                if (game.history.length > 0 && !isRoot(game.history[game.history.length-1])) {
                    replier.reply("환각증은 루트단어를 받았을 때만 사용할 수 있습니다."); return;
                }
                state.hallucination_uses++;
                state.patient_no_kill_turns = 2; // 전투 후 본인 디버프
                state.limited_length = 3;
                oppState.hallucination_active = true;
                replier.reply("[환자] 환각증 발동! 상대는 1턴간 앞말잇기를 해야합니다.");
            }
        }
        else if (state.job === "감시자" && !isAbilityDisabled) {
            if (ability === "탐지") {
                if (state.detect_uses >= 2) { replier.reply("탐지를 모두 사용했습니다."); return; }
                if (state.detect_cooldown > 0) { replier.reply("탐지 쿨타임입니다."); return; }
                state.detect_uses++; state.detect_cooldown = 6;
                state.detect_active_turns = 1;
                replier.reply("[감시자] 탐지 발동! 다음 패시브 발동 시 2배 차감.");
            }
        }
        else if (state.job === "뜀틀선수" && !isAbilityDisabled) {
            if (ability === "허들 넘기") {
                if (game.turnCount < 22) { replier.reply("허들 넘기는 22턴 이상부터 사용 가능합니다."); return; }
                if (state.hurdle_uses >= 1) { replier.reply("허들 넘기 능력을 모두 사용했습니다."); return; }
                state.hurdle_uses++;
                state.vault_max++; state.vault_cooldown = 0;
                replier.reply("[뜀틀선수] 허들 넘기 발동! 뜀틀 기회 +1 및 쿨타임 초기화.");
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
                replier.reply("[전우치] 직격뢰! '" + targetParam + "' 단어가 완전히 소멸했습니다.");
            }
        }
        else if (state.job === "시프터" && !isAbilityDisabled) {
            if (ability === "시프트") {
                if (state.shift_uses >= 3) { replier.reply("시프트를 모두 사용했습니다."); return; }
                const vowelSeq = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
                let decom = decomposeSyllable(game.lastLetter.s2);
                if (!decom) { replier.reply("분해 불가"); return; }
                let curIdx = vowelSeq.indexOf(decom.jungsung);
                if (curIdx === -1 || curIdx === vowelSeq.length - 1) { replier.reply("더 넘길 모음이 없습니다."); return; }
                decom.jungsung = vowelSeq[curIdx + 1];
                let nextList = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
                let newChar = composeSyllable(decom.ci, nextList.indexOf(decom.jungsung), decom.gi);
                game.lastLetter.s1 = newChar; // 두음 미적용
                game.lastLetter.s2 = newChar;
                state.shift_uses++;
                replier.reply("[시프터] 시프트 발동! 이을 음절 모음이 이동하여 '" + newChar + "' (으)로 변경되었습니다.");
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
                replier.reply("[비밀요원] 포획 발동! '" + targetParam + "' 로 시작하는 유도/루트 단어가 4개 소멸했으며, 상대방은 2턴간 패시브 및 능력 불가.");
            }
        }
        else if (state.job === "사과" && !isAbilityDisabled) {
            if (ability === "사구아") {
                if (state.sagua_uses >= 1) { replier.reply("사구아 능력을 모두 사용했습니다."); return; }
                state.sagua_uses++;
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 3);
                replier.reply("[사과] 사구아 발동! 상대는 3턴간 패시브 및 능력을 잃습니다.");
            }
        }
        else if (state.job === "시인" && !isAbilityDisabled) {
            if (ability === "2음절") {
                if (state.poetic_2_uses >= 3) { replier.reply("2음절 능력을 모두 사용했습니다."); return; }
                if (state.poetic_2_cooldown > 0) { replier.reply("2음절 쿨타임입니다."); return; }
                state.poetic_2_uses++; state.poetic_2_cooldown = 2;
                oppState.only_length_2_turns = Math.max(oppState.only_length_2_turns, 1);
                replier.reply("[시인] 2음절 발동! 상대방은 1턴간 2글자 단어만 사용할 수 있습니다.");
            } else if (ability === "시적 허용") {
                if (state.poetic_allow_uses >= 2) { replier.reply("시적 허용 능력을 모두 사용했습니다."); return; }
                if (state.poetic_allow_cooldown > 0) { replier.reply("시적 허용 쿨타임입니다."); return; }
                state.poetic_allow_uses++; state.poetic_allow_cooldown = 3;
                oppState.no_du_eum_turns = Math.max(oppState.no_du_eum_turns, 1);
                replier.reply("[시인] 시적 허용 발동! 상대방은 1턴간 두음법칙을 사용할 수 없습니다.");
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
                replier.reply("[공룡] 삼키기 발동! '" + swallowed + "'를 삼켜 이전 단어 '" + lastValid + "'로 되돌렸습니다.\n삼킨 직후 3글자 이하 일반단어만 가능.");
            } else if (ability === "브레스") {
                if (game.turnCount < 10) { replier.reply("10턴부터 사용 가능합니다."); return; }
                if (state.breath_uses >= 1) { replier.reply("브레스를 모두 사용했습니다."); return; }
                state.breath_uses++;
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                replier.reply("[공룡] 브레스 발동! 상대 유도 금지.");
            } else if (ability === "꼬리 날리기") {
                if (game.turnCount < 13) { replier.reply("13턴부터 사용 가능합니다."); return; }
                if (state.tail_uses >= 1) { replier.reply("꼬리 날리기를 모두 사용했습니다."); return; }
                state.tail_uses++; state.tail_active = true;
                replier.reply("[공룡] 꼬리 날리기 발동! 다음 턴 능력 불가 상태 무시.");
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
                    replier.reply("[마법사] 공허 발동! 종성이 지워져 '" + newChar + "' 로 변경되었습니다.");
                } else {
                    replier.reply("종성이 없는 음절입니다.");
                }
            } else if (ability === "폭발") {
                if (game.turnCount < 14) { replier.reply("14턴 이상 시 사용."); return; }
                if (state.explosion_uses >= 1) { replier.reply("모두 사용."); return; }
                state.disabled_turns = 0; state.no_yudo_turns = 0; state.no_hanbang_turns = 0; state.no_du_eum_turns = 0;
                state.only_even_turns = 0; state.only_odd_turns = 0; state.only_length_2_turns = 0; state.limited_length = 0; state.target_active_turns = 0;
                state.explosion_uses++;
                replier.reply("[마법사] 폭발! 모든 디버프가 제거됩니다.");
            }
        }
        else if (state.job === "사신" && !isAbilityDisabled) {
            if (ability === "사형 선고") {
                if (state.death_uses >= 4444) return;
                if (state.death_cooldown > 0) { replier.reply("쿨타임입니다."); return; }
                state.death_uses++; state.death_cooldown = 4;
                if (state.execution_count <= 4) {
                    replier.reply("[사신] 사형 선고 발동! (처형 수 4 이하)\n사신이 게임에서 승리합니다!");
                    delete games[room]; return;
                } else if (state.execution_count <= 18) {
                    // "4글자 이하인 단어를 사용할 수 없음" = 5글자 이상만 허용 → min_length = 5
                    oppState.min_length = Math.max(oppState.min_length || 0, 5);
                    replier.reply("[사신] 사형 선고 발동! 1턴간 상대방은 5글자 이상의 단어만 사용할 수 있습니다.");
                }
            }
        }
        else if (state.job === "수학자") { 
            // abilities can be used even if disabled? No.
            if (isAbilityDisabled) return;
            state.used_active_this_turn = true;
            if (ability === "계산") {
                if (state.calc_uses>=2) return;
                if (state.calc_cooldown>0) return;
                state.calc_uses++; state.calc_cooldown=1;
                replier.reply("[수학자] 스킬 결과: " + state.math_result);
                if (state.math_result === 20) {
                    replier.reply("수학자가 게임에서 승리합니다!");
                    delete games[room]; return;
                }
            } else if (ability === "덧셈") {
                if (state.add_uses>=3) return;
                if (state.add_cooldown>0) return;
                if(game.history.length>0) state.math_result += game.history[game.history.length-1].length;
                state.add_uses++; state.add_cooldown=2;
                replier.reply("[수학자] 덧셈 발동!");
            } else if (ability === "뺄셈") {
                if (state.sub_uses>=2) return;
                if(game.history.length>0) state.math_result -= game.history[game.history.length-1].length;
                state.sub_uses++;
                replier.reply("[수학자] 뺄셈 발동!");
            } else if (ability === "곱셈") {
                if (state.mul_uses>=1) return;
                if(game.history.length>0) state.math_result *= game.history[game.history.length-1].length;
                state.mul_uses++;
                replier.reply("[수학자] 곱셈 발동!");
            } else if (ability === "교정") {
                if (state.correct_uses>=2) return;
                if (state.correct_cooldown>0) return;
                state.math_result += 1;
                state.correct_uses++; state.correct_cooldown=4;
                replier.reply("[수학자] 교정 발동!");
            } else if (ability === "미적분") {
                if (state.calculus_uses>=1) return;
                state.calculus_uses++;
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                replier.reply("[수학자] 미적분 발동! 상대 능력 무력화 1턴.");
            }
        }
        else if (state.job === "생존자" && !isAbilityDisabled) {
            if (ability === "긴급 구조") {
                if (state.rescue_uses >= 2) return;
                if (state.rescue_cooldown > 0) return;
                if (!isRoot(game.history[game.history.length-1]) && !isYudo(game.history[game.history.length-1])) return;
                // rule: [A, B, C, D, E] -> remove A,B. [C,D,E] -> reverse to [E,D,C] but reverse string. Actually user said "기보에 추가가 아닌 바뀌는 것입니다. 기차 차표 표범 범죄 죄인 -> 인죄 죄범 범표"
                let newHist = [];
                for(let i=game.history.length-1; i>=2; i--) {
                    let w = game.history[i];
                    newHist.push(w.split('').reverse().join('')); // 인죄 죄범 범표
                }
                game.history = newHist;
                let lastValid = game.history[game.history.length-1];
                let last = lastValid[lastValid.length-1];
                game.lastLetter.s1 = applyDuEum(last); game.lastLetter.s2 = last;
                
                state.rescue_uses++; state.rescue_cooldown = 7;
                state.rescue_no_kill_turns = 1;
                state.disabled_turns = 0; state.no_yudo_turns = 0; state.no_hanbang_turns = 0; state.no_du_eum_turns = 0;
                replier.reply("[생존자] 긴급 구조 발동! 모든 기보가 교체되고 디버프가 제거됩니다. 변경된 마지막 단어: " + lastValid);
            }
        }
        else if (state.job === "악당" && !isAbilityDisabled) {
            if (ability === "결계") {
                if (state.barrier_uses >= 4) return;
                if (state.barrier_cooldown > 0) return;
                let dur = game.history.length>0 ? game.history[game.history.length-1].length : 2;
                state.barrier_uses++; state.barrier_cooldown = 5;
                state.barrier_turns = dur;
                state.barrier_chosungs = ["ㄱ","ㄴ"];
                replier.reply("[악당] " + dur + "턴 간 지속되는 결계 생성!");
            } else if (ability === "왜곡") {
                if (state.distort_uses >= 2 || state.barrier_turns === 0) return;
                if (state.distort_cooldown > 0) return;
                state.distort_uses++; state.distort_cooldown = 1;
                let dict = {"ㄱ":"ㅎ", "ㄴ":"ㅍ", "ㄷ":"ㅌ", "ㄹ":"ㅋ"}; // 간단 매핑, 나머지는 무시
                for(let i=0; i<state.barrier_chosungs.length; i++) {
                    if(dict[state.barrier_chosungs[i]]) state.barrier_chosungs[i] = dict[state.barrier_chosungs[i]];
                }
                if (state.barrier_chosungs.length >= 4) oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                replier.reply("[악당] 왜곡 발생!");
            }
        }
        else if (state.job === "기자" && !isAbilityDisabled) {
            if (ability === "거짓 보도") {
                if (state.report_uses >= 4) return;
                if (state.report_cooldown > 0) return;
                state.report_uses++; state.report_cooldown = 3; state.report_turns = 1;
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                oppState.no_du_eum_turns = Math.max(oppState.no_du_eum_turns, 1);
                replier.reply("[기자] 거짓 보도 방송 1턴 전개!");
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
                replier.reply("[검객] 찌르기 발동!");
            } else if (ability === "가르기") {
                if (state.slice_uses >= 3 || state.slice_cooldown > 0) return;
                if (game.history.length === 0) return;
                let lastw = game.history[game.history.length-1];
                let decom = decomposeSyllable(lastw[lastw.length-1]);
                if (decom.gi > 0) {
                    game.lastLetter.s2 = composeSyllable(decom.ci, 0, decom.gi);
                } else {
                    game.lastLetter.s2 = composeSyllable(decom.ci, decom.ji, 0);
                }
                game.lastLetter.s1 = game.lastLetter.s2;
                state.slice_uses++; state.slice_cooldown = 3;
                if (game.turnCount < 12) state.slice_active = true;
                replier.reply("[검객] 가르기 발동! 이을 글자 파편 변경됨: " + game.lastLetter.s2);
            }
        }
        else if (state.job === "마하트마간디" && !isAbilityDisabled) {
            if (ability === "억제") {
                if (state.gandhi_stacks < 1) return;
                if (state.suppress_cooldown > 0) return;
                state.gandhi_stacks--; state.suppress_cooldown = 3;
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                replier.reply("[마하트마간디] 억제 발동! 상대 1턴간 유도 불가.");
            }
        }
        else if (state.job === "수리사" && !isAbilityDisabled) {
            if (ability === "수리") {
                if (state.repair_uses >= 4) return;
                if (state.repair_cooldown > 0) return;
                let decom = decomposeSyllable(game.lastLetter.s2);
                const swapMap = {"ㅏ":"ㅜ", "ㅑ":"ㅠ", "ㅓ":"ㅗ", "ㅕ":"ㅛ", "ㅣ":"ㅡ", "ㅜ":"ㅏ", "ㅠ":"ㅑ", "ㅗ":"ㅓ", "ㅛ":"ㅕ", "ㅡ":"ㅣ"};
                if (decom && swapMap[decom.jungsung]) {
                    let JungList = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
                    let newChar = composeSyllable(decom.ci, JungList.indexOf(swapMap[decom.jungsung]), decom.gi);
                    game.lastLetter.s2 = newChar;
                    game.lastLetter.s1 = applyDuEum(newChar);
                    state.repair_uses++; state.repair_cooldown = 6; state.no_yudo_turns = Math.max(state.no_yudo_turns, 1);
                    replier.reply("[수리사] 수리 완료! '" + newChar + "' (으)로 변경되며 1턴 유도 불가.");
                } else {
                    replier.reply("수리할 수 없는 모음입니다.");
                }
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
        
        if (!isValidWord) {
            if (state.job !== "해커" || state.jojak_active === 0) { // 해커 조작은 사전 외 단어를 허용하는게 아니라 중복을 허용함. 단어 자체는 있어야함.
                replier.reply("사전에 등록되지 않은 단어입니다."); return;
            }
        }

        // 3. [중복 단어 체크]
        if (game.used.has(word)) {
            if (state.job === "해커" && state.jojak_active > 0) {
                replier.reply("조작 능력이 적용되어 중복 단어 [" + word + "] 를 재사용했습니다.");
            } else {
                replier.reply("이미 사용된 단어입니다."); return;
            }
        }

        // 4. [끝말 잇기 검증]
        let currentNextChar = nextCharForWord(game);
        if (game.history.length > 0) {
            // 환자 환각증 앞말잇기 강제
            if (state.hallucination_active) {
                let lastWord = game.history[game.history.length - 1];
                if (word[word.length - 1] !== lastWord[0]) {
                    replier.reply("환각증 여파로 이전 단어의 '첫음절'로 끝나는 앞말잇기를 해야 합니다."); return;
                }
            } else {
                if (word[0] !== game.lastLetter.s1 && word[0] !== game.lastLetter.s2 && word[0] !== nextw) {
                    replier.reply("'" + currentNextChar + "'(으)로 시작해야 합니다."); return;
                }
            }
        }

        // 5. [디버프 제약 검사]
        if (state.no_du_eum_turns > 0 && word[0] === game.lastLetter.s1 && game.lastLetter.s1 !== game.lastLetter.s2) {
            replier.reply("디버프: 두음법칙을 사용할 수 없습니다."); return;
        }
        if (state.no_hanbang_turns > 0 && is_hb) {
            replier.reply("디버프: 한방단어를 사용할 수 없습니다."); return;
        }
        if (state.no_yudo_turns > 0 && is_yd) {
            replier.reply("디버프: 유도단어를 사용할 수 없습니다."); return;
        }
        if (state.only_even_turns > 0 && word.length % 2 !== 0) {
            replier.reply("디버프: 짝수 글자 수의 단어만 사용할 수 있습니다."); return;
        }
        if (state.only_odd_turns > 0 && word.length % 2 === 0) {
            replier.reply("디버프: 홀수 글자 수의 단어만 사용할 수 있습니다."); return;
        }
        if (state.only_length_2_turns > 0 && word.length !== 2) {
            replier.reply("디버프: 두 글자 단어만 사용할 수 있습니다."); return;
        }
        if (state.limited_length > 0 && word.length > state.limited_length) {
            replier.reply("디버프: " + state.limited_length + "글자 이하의 단어만 사용할 수 있습니다."); return;
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

        let isAbilityDisabled = state.disabled_turns > 0 || state.lost_abilities;

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

        // 뜀틀선수 [뜀틀] 패시브
        if (state.job === "뜀틀선수" && word === "뜀틀" && !isAbilityDisabled) {
            if (state.vault_uses >= state.vault_max) { replier.reply("뜀틀 사용 횟수가 고갈되었습니다."); return; }
            if (state.vault_cooldown > 0) { replier.reply("뜀틀 쿨타임입니다."); return; }
            state.vault_uses++;
            state.vault_cooldown = 5;
            oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
            oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
            msgs.push("▶ 뜀틀선수 [뜀틀] 발동! 상대방은 1턴간 유도 및 능력/패시브 불가!");
        }

        // 해커 초토화 피격 검사
        if (oppState && oppState.job === "해커" && oppState.chotohwa_active > 0) {
            if (word.length >= 4 || is_exception) {
                state.lost_abilities = true;
                msgs.push("▶ 해커 [초토화] 피격! " + sender + "님의 능력이 영구 상실됩니다.");
            }
            oppState.chotohwa_active -= 1;
        }

        // 투자자 패시브
        if (oppState && oppState.job === "투자자" && !oppState.lost_abilities && oppState.disabled_turns === 0) {
            let change = 0;
            if (oppState.juga_jojak_active) {
                change = -word.length;
                oppState.juga_jojak_active = false;
                msgs.push("- 주가 조작 여파: 무조건 차감 (-" + word.length + ")");
            } else {
                change = word.length % 2 === 0 ? -word.length : word.length;
            }
            oppState.investor_stock += change;
            let dispStr = change > 0 ? ("상승(+" + change + ")") : ("하락(" + change + ")");
            msgs.push("▶ 투자자 패시브: 주가 " + dispStr + " [현재: " + oppState.investor_stock + " / 승리 목표: " + game.turnCount + " 이내]");
            if (oppState.investor_stock <= game.turnCount) {
                replier.reply(msgs.join("\n"));
                replier.reply("투자자(" + game.players[oppIndex] + ")가 주가 폭락을 달성하여 게임에서 승리했습니다!");
                delete games[room]; return;
            }
        }

        // 환자 [강박증]
        if (oppState && oppState.job === "환자" && !oppState.lost_abilities && oppState.disabled_turns === 0) {
            if (word.length % 2 !== 0 && oppState.opcd_cooldown === 0) { // 홀수 단어 사용시
                oppState.opcd_cooldown = 3;
                state.only_even_turns = Math.max(state.only_even_turns, 1);
                state.disabled_turns = Math.max(state.disabled_turns, 1);
                state.no_yudo_turns = Math.max(state.no_yudo_turns, 1);
                msgs.push("▶ 환자 [강박증] 발동! 1턴간 짝수 단어 강제 및 유도, 능력 사용 불가!");
            }
        }

        // 수집가 [수집]
        if (oppState && oppState.job === "수집가" && !oppState.lost_abilities && oppState.disabled_turns === 0) {
            let collected = [word[0]];
            if (oppState.mine_active > 0) { collected = word.split(''); oppState.mine_active = 0; msgs.push("- 채굴 효과로 모든 음절 수집!"); }
            oppState.collected_syllables = oppState.collected_syllables.concat(collected);
            msgs.push("▶ 수집가 [수집]: [" + collected.join(",") + "] 음절 휙득.");
        }
        if (state.job === "수집가" && game.customWords && game.customWords.has(word)) { // 추가단어 사용
            oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
            msgs.push("▶ 수집가 [추가단어 사용]: 상대는 1턴간 능력 불가!");
            game.customWords.delete(word);
        }

        // 감시자 [감시]
        if (oppState && oppState.job === "감시자" && !oppState.lost_abilities && oppState.disabled_turns === 0) {
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
                msgs.push("▶ 감시자 [감시]: 위반 행위 포착! (감시 수 -" + deduction + " 됨, 현재: " + oppState.watch_count + ")");
                if (oppState.watch_count <= 0) {
                    oppState.watch_count = 0;
                    msgs.push("- 감시 수 0 도달! 감시자가 무기한 룰 무시 상태가 됩니다.");
                }
            }
        }

        // 늑대인간 [포효]
        if (state.job === "늑대인간" && !isAbilityDisabled && state.roar_cooldown === 0) {
            let count = (word.match(/[ㅇㅎ]/g) || []).length;
            if (count >= 1) {
                oppState.only_even_turns = Math.max(oppState.only_even_turns, 2);
                msgs.push("▶ 늑대인간 [포효] 발동! 상대는 2턴간 짝수 단어 제한.");
                if (count >= 3) {
                    oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                    msgs.push("- 추가 효과: 상대 1턴간 능력 불가.");
                }
                state.roar_cooldown = 2;
            }
        }

        // 비밀요원 [타깃 확보]
        if (state.job === "비밀요원" && !isAbilityDisabled) {
            // 제출한 단어의 마지막 음절로 시작하는 4글자 이하 유도/루트단어 최대 3개 수집
            let tgt_last = word[word.length - 1];
            let tgt_due = applyDuEum(tgt_last);
            let foundTargets = [];
            if (WORD_SET && foundTargets.length < 3) {
                for (let w of WORD_SET) {
                    if (foundTargets.length >= 3) break;
                    if ((w[0] === tgt_last || w[0] === tgt_due) && w.length <= 4 && !game.used.has(w) && !(game.bannedWords && game.bannedWords.has(w))) {
                        if (isYudo(w) || isRoot(w)) foundTargets.push(w);
                    }
                }
            }
            if (foundTargets.length > 0) {
                state.targets = foundTargets;
                msgs.push("▶ 비밀요원 [타깃 확보]: 타깃 설정 [" + foundTargets.join(", ") + "]");
            } else {
                state.targets = [];
            }
        }
        if (oppState && oppState.job === "비밀요원" && oppState.targets.length > 0 && oppState.targets.includes(word)) {
            state.disabled_turns = Math.max(state.disabled_turns, 1);
            state.target_active_turns = 2;
            msgs.push("▶ 비밀요원 타깃 적중! 1턴 능력 불가 + 2턴간 포획 대상 (5글자 이상 금지)");
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
                msgs.push("▶ 67 발동! 상대는 유도 불가 연장 및 1턴 한방 불가.");
                if (oppState.no_yudo_turns >= 67) {
                    replier.reply(msgs.join("\n"));
                    replier.reply("67(" + game.players[game.currentTurnIndex] + ")가 유도 스택 67을 달성하여 즉시 승리합니다!");
                    delete games[room]; return;
                }
            }
        }

        // 사과 [삭와] - 단어 전체 글자의 초성/종성 체크
        if (state.job === "사과" && !isAbilityDisabled) {
            if (state.apple_passive_cooldown === 0) {
                let countApple = 0;
                let checkArr = ["ㅅ","ㄱ","ㄴ","ㅁ","ㅇ"];
                for (let i = 0; i < word.length; i++) {
                    let d = decomposeSyllable(word[i]);
                    if (d) {
                        if (checkArr.includes(d.chosung)) countApple++;
                        if (d.jongsung && checkArr.includes(d.jongsung)) countApple++;
                    }
                }
                if (countApple >= 2) {
                    if (state.apple_unused_turns >= 10) {
                        replier.reply(msgs.join("\n"));
                        replier.reply("사과(" + sender + ")의 [삭와] 패시브가 10턴 숙성 후 발동! 즉시 승리합니다!");
                        delete games[room]; return;
                    }
                    if (oppState.apple_debuff_turns > 0) oppState.apple_debuff_turns += 2;
                    else oppState.apple_debuff_turns = 3;
                    state.apple_passive_cooldown = 2;
                    state.apple_unused_turns = 0;
                    msgs.push("▶ 사과 [삭와] 발동! (조건 초성/종성 " + countApple + "개) 상대에게 사과 디버프 부여.");
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
                msgs.push("▶ 마하트마간디 [비폭력]! 스택 증가 (현재: " + oppState.gandhi_stacks + ")");
            }
            if (oppState.gandhi_stacks >= 4) {
                replier.reply(msgs.join("\n"));
                replier.reply("마하트마간디(" + game.players[oppIndex] + ")가 비폭력 스택 4를 달성하여 개발자를 협박해 즉시 승리합니다!");
                delete games[room]; return;
            }
        }

        // 은하계전사 [별인 듯 달 아닌 별]
        if (state.job === "은하계전사" && !isAbilityDisabled && state.star_cooldown === 0) {
            if (word.includes("별") || word.includes("달")) {
                state.star_stacks++;
                state.star_cooldown = 1;
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 2);
                msgs.push("▶ 은하계전사 패시브 발동! 상대 2턴간 능력/패시브 불가.");
                // 16턴 이전 3회 이상 사용 → 끝음절 [벨] 고정
                if (state.star_stacks >= 3 && game.turnCount < 16 && !state.star_permanent_done) {
                    word = word.substring(0, word.length - 1) + "벨";
                    state.star_permanent_done = true;
                    msgs.push("- 3회 누적! 끝음절이 [벨]로 고정되었습니다.");
                }
                // 16턴 이상, 16턴 이전에 벨 지급 이력 있음, 아직 궁극기 미사용
                if (game.turnCount >= 16 && state.star_permanent_done && !state.star_ult_used) {
                    word = word.substring(0, word.length - 1) + "볠";
                    state.star_ult_used = true;
                    oppState.lost_abilities = true;
                    msgs.push("- [궁극] 16턴 돌파! 끝음절 [볠] + 상대 영구 능력 상실!");
                }
            }
        }

        // 사신 [처형]
        if (state.job === "사신" && !isAbilityDisabled) {
            state.execution_count -= word.length;
            msgs.push("▶ 사신 [처형] 발동! (남은 처형 수: " + state.execution_count + ")");
            if (word.length >= 8) {
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                oppState.no_hanbang_turns = Math.max(oppState.no_hanbang_turns, 1);
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                msgs.push("- 처형식 거행! 상대 1턴간 능력/한방/유도 불가.");
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
                    msgs.push("▶ 기관사 [운행]: " + (9 - state.train_stations) + "번째 역 정차! 상대 1턴 유도/능력 불가. (남은 역: " + state.train_stations + ")");
                } else {
                    msgs.push("▶ 기관사 [운행]: " + (9 - state.train_stations) + "번째 역 정차! (기관사 대전 - 디버프 없음) 남은 역: " + state.train_stations);
                }
                if (state.train_stations <= 0) {
                    replier.reply(msgs.join("\n"));
                    if (oppIsEngineer) {
                        replier.reply("기관사 대 기관사: 종점 동시 도달 → 무승부 처리!");
                    } else {
                        replier.reply("기관사(" + sender + ")가 종점에 도착하여 게임에서 승리합니다! 🚂");
                    }
                    delete games[room]; return;
                }
            }
        }

        // 생존자 [신호] 패시브 - SOS 모스부호
        if (state.job === "생존자" && !isAbilityDisabled && state.signal_cooldown === 0) {
            const SOS_SEQ = ["·","·","·","-","-","-","·","·","·","-","·","-","·","-","-"];
            let newSignal = word.length === 2 ? "·" : "-";
            let curSeq = state.signal_sequence ? state.signal_sequence.split(" ").filter(function(s){ return s !== ""; }) : [];
            let expected = curSeq.length < SOS_SEQ.length ? SOS_SEQ[curSeq.length] : null;
            if (expected && newSignal === expected) {
                curSeq.push(newSignal);
                state.signal_sequence = curSeq.join(" ");
                state.signal_cooldown = 1;
                msgs.push("▶ 생존자 [신호]: [" + state.signal_sequence + "] (목표: · · · - - - · · · - · - · - -)");
                if (curSeq.length === 15) {
                    replier.reply(msgs.join("\n"));
                    replier.reply("생존자(" + sender + ")가 S·O·S 신호를 완성하여 즉시 승리합니다! 🆘");
                    delete games[room]; return;
                }
            } else {
                // 오신호 - 리셋 + 상대 1턴간 3글자 이상 유도 불가
                state.signal_sequence = "";
                state.signal_cooldown = 1;
                oppState.no_long_yudo_turns = Math.max(oppState.no_long_yudo_turns || 0, 1);
                msgs.push("▶ 생존자 [신호] 오신호! 신호 리셋. 상대 1턴간 3글자 이상 유도단어 불가.");
            }
        }

        // 악당 [결계] 적중 갱신
        if (oppState && oppState.job === "악당" && oppState.barrier_turns > 0) {
            let additionalCount = word.length;
            let adds = ["ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
            for (let i = 0; i < additionalCount && oppState.barrier_chosungs.length < adds.length + 2; i++) {
                let nextIdx = oppState.barrier_chosungs.length - 2;
                if (nextIdx >= 0 && nextIdx < adds.length) {
                    oppState.barrier_chosungs.push(adds[nextIdx]);
                }
            }
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
        if (state.bulletproof_cooldown > 0) state.bulletproof_cooldown -= 1;
        if (state.repair_cooldown > 0) state.repair_cooldown -= 1;

        if (state.disabled_turns > 0) state.disabled_turns -= 1;
        if (state.no_yudo_turns > 0) state.no_yudo_turns -= 1;
        if (state.no_hanbang_turns > 0) state.no_hanbang_turns -= 1;
        if (state.no_du_eum_turns > 0) state.no_du_eum_turns -= 1;
        if (state.only_even_turns > 0) state.only_even_turns -= 1;
        if (state.only_odd_turns > 0) state.only_odd_turns -= 1;
        if (state.only_length_2_turns > 0) state.only_length_2_turns -= 1;
        if (state.limited_length > 0) state.limited_length = 0;
        if (state.target_active_turns > 0) state.target_active_turns -= 1;
        if (state.patient_no_kill_turns > 0) state.patient_no_kill_turns -= 1;
        if (state.barrier_turns > 0) state.barrier_turns -= 1;
        if (state.report_turns > 0) state.report_turns -= 1;
        if (state.apple_debuff_turns > 0) state.apple_debuff_turns -= 1;
        if (state.min_length > 0) state.min_length = 0;
        if (state.no_long_yudo_turns > 0) state.no_long_yudo_turns -= 1;

        if (state.dino_swallowed) state.dino_swallowed = false;
        if (state.tail_active) state.tail_active = false;
        if (state.slice_active) state.slice_active = false;

        // 마하트마간디 비폭력: 능력 사용 후 다음 턴 스택 증가 (모든 직업 공통)
        if (state.used_active_this_turn) {
            if (oppState && oppState.job === "마하트마간디" && !oppState.lost_abilities) {
                oppState.gandhi_stacks++;
                msgs.push("▶ 마하트마간디 [비폭력] (능력 사용 감지): 스택 증가 (현재: " + oppState.gandhi_stacks + ")");
                if (oppState.gandhi_stacks >= 4) {
                    replier.reply(msgs.join("\n"));
                    replier.reply("마하트마간디(" + game.players[oppIndex] + ")가 비폭력 스택 4를 달성하여 즉시 승리합니다!");
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

});
