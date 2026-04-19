/* ========================================================
   채린룰 능력 끝말잇기 봇 (능력 및 직업 구현 버전)
   ======================================================== */

// --- [설정 영역] ---
let PREFIX = "1";       // 일반 명령어 접두사 (채린룰 기본)
let INPUT_PFX = "0";    // 단어 입력 접두사
let ADMIN_PFX = ".dev";  // 관리자 명령어 접두사
let games = {};
let WORD_SET = null; 
let KILL_SET = null;
let nextw = "";
let isOn = true;

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


const ADMIN_HASHES = ["1003380129"];
/** 관리자 체크 */
function isAdmin(imageDB) {
    const hash = String(java.lang.String(imageDB.getProfileImage()).hashCode());
    return ADMIN_HASHES.includes(hash);
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
    let state = { job: job, lost_abilities: false, disabled_turns: 0, no_yudo_turns: 0, no_hanbang_turns: 0, no_du_eum_turns: 0, only_even_turns: 0, only_odd_turns: 0, only_length_2_turns: 0, limited_length: 0 };
    
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
        state.star_cooldown = 0; state.star_stacks = 0; state.star_permanent_done = false;
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
        let title = name + " [" + state.job + "]";
        
        let abilityInfo = [];
        if (state.job === "해커") {
            abilityInfo.push("조작 " + (3 - state.jojak_uses) + "회/쿨 " + state.jojak_cooldown + "턴");
            abilityInfo.push("복제 " + (1 - state.bokje_uses) + "회");
            abilityInfo.push("초토화 " + (2 - state.chotohwa_uses) + "회/쿨 " + state.chotohwa_cooldown + "턴");
            if (state.jojak_active > 0) buff.push("- 조작 활성화: " + state.jojak_active + "턴간 중복 단어 가능");
            if (state.chotohwa_active > 0) buff.push("- 초토화 장전: 다음 턴 발동");
        } else if (state.job === "투자자") {
            abilityInfo.push("주가 조작 " + (2 - state.juga_jojak_uses) + "회/쿨 " + state.juga_jojak_cooldown + "턴");
            etc.push("- 현재 주가: " + state.investor_stock + " / 타겟: " + game.turnCount);
            if (state.juga_jojak_active) buff.push("- 주가 조작 장전: 다음 턴 강제 차감");
        } else if (state.job === "환자") {
            abilityInfo.push("강박증 쿨 " + state.opcd_cooldown + "턴");
            abilityInfo.push("환각증 " + (1 - state.hallucination_uses) + "회");
            if (state.patient_no_kill_turns > 0) debuff.push("- 환각증 여파: " + state.patient_no_kill_turns + "턴간 예외단어(한방/유도) 불가");
        } else if (state.job === "수집가") {
            abilityInfo.push("제작 쿨 " + state.make_cooldown + "턴");
            abilityInfo.push("채굴 " + (2 - state.mine_uses) + "회/쿨 " + state.mine_cooldown + "턴");
            etc.push("- 수집된 음절: [" + state.collected_syllables.join(", ") + "]");
            if (state.mine_active > 0) buff.push("- 채굴 활성화: 1턴간 모든 음절 수집");
        } else if (state.job === "감시자") {
            abilityInfo.push("탐지 " + (2 - state.detect_uses) + "회/쿨 " + state.detect_cooldown + "턴");
            etc.push("- 현재 감시 수: " + state.watch_count);
            if (state.detect_active_turns > 0) buff.push("- 탐지 활성화: 다음 감시 패시브 2배");
        } else if (state.job === "뜀틀선수") {
            abilityInfo.push("뜀틀 " + (state.vault_max - state.vault_uses) + "회/쿨 " + state.vault_cooldown + "턴");
            abilityInfo.push("허들 넘기 " + (1 - state.hurdle_uses) + "회");
        } else if (state.job === "전우치") {
            abilityInfo.push("잔상 " + (1 - state.afterimage_uses) + "회");
            abilityInfo.push("직격뢰 " + (4 - state.lightning_uses) + "회/쿨 " + state.lightning_cooldown + "턴");
        } else if (state.job === "기관사") {
            etc.push("- 남은 전철역 수: " + state.train_stations);
        } else if (state.job === "늑대인간") {
            abilityInfo.push("포효 쿨 " + state.roar_cooldown + "턴");
        } else if (state.job === "시프터") {
            abilityInfo.push("시프트 " + (3 - state.shift_uses) + "회");
        } else if (state.job === "비밀요원") {
            abilityInfo.push("포획 " + (2 - state.capture_uses) + "회/쿨 " + state.capture_cooldown + "턴");
            etc.push("- 설정된 타깃 수: " + state.targets.length + (state.targets.length > 0 ? " [" + state.targets.join(",") + "]" : ""));
        } else if (state.job === "67") {
            abilityInfo.push("67 쿨 " + state.sixtyseven_cooldown + "턴");
        } else if (state.job === "사과") {
            abilityInfo.push("사구아 " + (1 - state.sagua_uses) + "회");
            etc.push("- 삭와 미사용 지속: " + state.apple_unused_turns + "턴 / (쿨: " + state.apple_passive_cooldown + ")");
            if (state.apple_debuff_turns > 0) debuff.push("- 사과 디버프: " + state.apple_debuff_turns + "턴간 3글자 이상 한방 및 5글자 이상 유도 불가");
        } else if (state.job === "시인") {
            abilityInfo.push("2음절 " + (3 - state.poetic_2_uses) + "회/쿨 " + state.poetic_2_cooldown + "턴");
            abilityInfo.push("시적 허용 " + (2 - state.poetic_allow_uses) + "회/쿨 " + state.poetic_allow_cooldown + "턴");
        } else if (state.job === "공룡") {
            abilityInfo.push("삼키기 " + (2 - state.swallow_uses) + "회/쿨 " + state.swallow_cooldown + "턴");
            abilityInfo.push("브레스 " + (1 - state.breath_uses) + "회, 꼬리 날리기 " + (1 - state.tail_uses) + "회");
            if (state.tail_active) buff.push("- 꼬리 날리기: 다음 차례 능력 불가 무시");
        } else if (state.job === "마법사") {
            abilityInfo.push("공허 " + (5 - state.void_uses) + "회/쿨 " + state.void_cooldown + "턴");
            abilityInfo.push("폭발 " + (1 - state.explosion_uses) + "회");
            if (game.turnCount <= 14) debuff.push("- 부작용: 14턴 이전까지 한방/유도 불가");
        } else if (state.job === "사신") {
            abilityInfo.push("사형 선고 " + (4444 - state.death_uses) + "회/쿨 " + state.death_cooldown + "턴");
            etc.push("- 남은 처형 수: " + state.execution_count);
        } else if (state.job === "수학자") {
            abilityInfo.push("계산 " + (2 - state.calc_uses) + "회/쿨 " + state.calc_cooldown + "턴");
            abilityInfo.push("덧셈 " + (3 - state.add_uses) + "회/쿨 " + state.add_cooldown + "턴");
            abilityInfo.push("뺄셈 " + (2 - state.sub_uses) + "회, 곱셈 " + (1 - state.mul_uses) + "회");
            abilityInfo.push("교정 " + (2 - state.correct_uses) + "회/쿨 " + state.correct_cooldown + "턴, 미적분 " + (1 - state.calculus_uses) + "회");
            // Result is hidden unless directly requested via active, but logic maintains it. (Or hide mostly).
        } else if (state.job === "생존자") {
            abilityInfo.push("긴급 구조 " + (2 - state.rescue_uses) + "회/쿨 " + state.rescue_cooldown + "턴");
            etc.push("- 모스부호: [" + state.signal_sequence + "]");
        } else if (state.job === "악당") {
            abilityInfo.push("결계 " + (4 - state.barrier_uses) + "회/쿨 " + state.barrier_cooldown + "턴");
            abilityInfo.push("왜곡 " + (2 - state.distort_uses) + "회/쿨 " + state.distort_cooldown + "턴");
            if (state.barrier_turns > 0) buff.push("- 결계 전개 중 (" + state.barrier_turns + "턴 남음) : [" + state.barrier_chosungs.join(",") + "]");
        } else if (state.job === "기자") {
            abilityInfo.push("거짓 보도 " + (4 - state.report_uses) + "회/쿨 " + state.report_cooldown + "턴");
            if (state.report_turns > 0) buff.push("- 방송 중: 상대방 패시브/능력/두음법칙 불가 (" + state.report_turns + "턴 남음)");
        } else if (state.job === "검객") {
            abilityInfo.push("찌르기 " + (2 - state.stab_uses) + "회/쿨 " + state.stab_cooldown + "턴");
            abilityInfo.push("가르기 " + (3 - state.slice_uses) + "회/쿨 " + state.slice_cooldown + "턴");
        } else if (state.job === "마하트마간디") {
            abilityInfo.push("비폭력 스탯 쿨 " + state.gandhi_cooldown + "턴, 억제 쿨 " + state.suppress_cooldown + "턴");
            etc.push("- 비폭력 스탯: " + state.gandhi_stacks);
        } else if (state.job === "은하계전사") {
            abilityInfo.push("별달 패시브 쿨 " + state.star_cooldown + "턴");
            etc.push("- 별달 스택: " + state.star_stacks);
        } else if (state.job === "수리사") {
            abilityInfo.push("수리 " + (4 - state.repair_uses) + "회/쿨 " + state.repair_cooldown + "턴");
        }

        if (state.disabled_turns > 0) debuff.push("- 능력/패시브 상실 상태 (" + state.disabled_turns + "턴 남음)");
        if (state.lost_abilities) debuff.push("- 능력 영구 상실 상태");
        if (state.no_yudo_turns > 0) debuff.push("- 유도단어 불가 (" + state.no_yudo_turns + "턴 남음)");
        if (state.no_hanbang_turns > 0) debuff.push("- 한방단어 불가 (" + state.no_hanbang_turns + "턴 남음)");
        if (state.no_du_eum_turns > 0) debuff.push("- 두음법칙 불가 (" + state.no_du_eum_turns + "턴 남음)");
        if (state.only_even_turns > 0) debuff.push("- 짝수 글자 수 단어만 허용 (" + state.only_even_turns + "턴 남음)");
        if (state.only_length_2_turns > 0) debuff.push("- 2글자 단어만 허용 (" + state.only_length_2_turns + "턴 남음)");
        if (state.limited_length > 0) debuff.push("- " + state.limited_length + "글자 이하 단어만 허용");
        if (state.target_active_turns > 0) debuff.push("- 비밀요원 타깃 포착 중 (" + state.target_active_turns + "턴 남음, 5글자 이상 금지)");
        
        if (otherState && otherState.job === "해커" && otherState.chotohwa_active > 0) {
            debuff.push("- 초토화 위협: 4글자 이상 사용 시 능력 상실");
        }

        return title + "\n\n[ 버프 ]\n" + (buff.length > 0 ? buff.join("\n") : "없음") + "\n\n" +
               "[ 디버프 ]\n" + (debuff.length > 0 ? debuff.join("\n") : "없음") + "\n\n" +
               "[ 기타 ]\n" + (etc.length > 0 ? etc.join("\n") : "없음");
    }

    let msg = "기보\n\n" + historyStr + "\n\n" +
              game.turnCount + "턴 | 채린룰 | 이을 음절 : " + nextChar + "\n\n" +
              "차례 : " + currentPlayer + " [" + curState.job + "]\n\n\n" +
              "< 서로의 상태 >\n\n" +
              makePlayerInfo(currentPlayer, curState, nxtState) + "\n\n\n\n" +
              makePlayerInfo(nextPlayer, nxtState, curState);
              
    return msg;
}


function response(room, msg, sender, isGroupChat, replier, imageDB) {   
    if(isAdmin(imageDB)) {
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
    if (msg.startsWith(ADMIN_PFX) && isAdmin(imageDB)) {
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
                playerStates: {}
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

    // --- 직업 선택 ---
    if ((msg.startsWith(PREFIX + "직업 ") || msg.startsWith(PREFIX + "ㅈㅇ ")) && game && game.phase === "job_selection") {
        if (!game.players.includes(sender)) return;
        let job = msg.replace(PREFIX + "직업 ", "").replace(PREFIX + "ㅈㅇ ", "").trim();
        if (job === "ㅎㅋ") job = "해커";
        if (job === "ㅌㅈㅈ") job = "투자자";
        
        if (!ALL_JOBS.includes(job)) { replier.reply("존재하지 않거나 선택할 수 없는 직업입니다."); return; }
        if (game.playerStates[sender]) { replier.reply("이미 직업을 선택하셨습니다."); return; }
        
        game.playerStates[sender] = initJobState(job);
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
                "{ " + p2 + " : " + p2_job + " }\n\n" +
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
                game.history.pop();
                let lastValid = game.history[game.history.length - 1];
                let last = lastValid[lastValid.length - 1];
                game.lastLetter.s1 = applyDuEum(last); game.lastLetter.s2 = last;
                state.swallow_uses++; state.swallow_cooldown = 7; state.dino_swallowed = true;
                replier.reply("[공룡] 삼키기 발동! 마지막 단어를 삼켜 이전 단어 '" + lastValid + "' 로 되돌렸습니다. 1턴간 3글자 이하 일반단어만 가능.");
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
                    replier.reply("[사신] 사형 선고 발동! (처형 수 4 이하) \n사신이 게임에서 승리합니다!");
                    delete games[room]; return;
                } else if (state.execution_count <= 18) {
                    oppState.limited_length = Math.max(oppState.limited_length, 4); // actually limit words to <=4 length implies >4 length? No, "글자 수가 4글자 이하인 단어를 사용할 수 없습니다." -> must be >4 length.
                    replier.reply("[사신] 사형 선고 발동! 1턴간 상대방은 4글자 이하 단어를 사용할 수 없습니다. (>4 글자만 가능)"); // Wait, wording in plan: limited to >4
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
        if (state.target_active_turns > 0 && word.length >= 5) {
            replier.reply("비밀요원 타깃 포착 중: 5글자 이상의 단어를 사용할 수 없습니다."); return;
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
        if (state.job === "비밀요원" && !isAbilityDisabled && state.targets.length === 0) {
            // To simulate taking up to 3 long valid words. We arbitrarily just set state.targets for design (skip real DB scan for brevity unless needed)
            state.targets = ["타깃1", "타깃2"]; // 실 구현 시 DB검색이 들어가야하지만 동기식 부하로 임시 처리
            msgs.push("▶ 비밀요원 [타깃 확보] 발동: 타깃 단어가 설정되었습니다.");
        }
        if (oppState && oppState.job === "비밀요원" && oppState.targets.includes(word)) {
            state.disabled_turns = Math.max(state.disabled_turns, 1);
            state.target_active_turns = 2;
            msgs.push("▶ 비밀요원 타깃 적중! 2턴간 포획 대상이 되며 5글자 이상 불가.");
            oppState.targets = []; // 리셋
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

        // 사과 [삭와]
        if (state.job === "사과" && !isAbilityDisabled) {
            if (state.apple_passive_cooldown === 0) {
                let countApple = 0;
                let chodecom = decomposeSyllable(word[0]);
                let jongdecom = decomposeSyllable(word[word.length - 1]);
                let checkArr = ["ㅅ","ㄱ","ㄴ","ㅁ","ㅇ"];
                if (chodecom && checkArr.includes(chodecom.chosung)) countApple++;
                if (jongdecom && checkArr.includes(jongdecom.jongsung)) countApple++;
                
                if (countApple >= 2) {
                    if (state.apple_unused_turns >= 10) {
                        replier.reply("사과(" + game.players[game.currentTurnIndex] + ")의 삭와 패시브가 10턴 숙성되어 발동하면서 즉시 승리합니다!");
                        delete games[room]; return;
                    }
                    if (oppState.apple_debuff_turns > 0) oppState.apple_debuff_turns += 2;
                    else oppState.apple_debuff_turns = 3;
                    state.apple_passive_cooldown = 2;
                    state.apple_unused_turns = 0;
                    msgs.push("▶ 사과 [삭와] 발동! 사과 디버프가 부여됩니다.");
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
                msgs.push("▶ 은하계전사 패시브 발동! 상대 능력 2턴 불가 및 루트 음절 허용 강제.");
                if (state.star_stacks >= 3 && game.turnCount < 16) {
                    word = word.substring(0, word.length - 1) + "벨";
                    msgs.push("- 3회 누적! 끝음절이 [벨]로 고정되었습니다.");
                    state.star_permanent_done = true;
                } else if (game.turnCount >= 16 && state.star_permanent_done && state.star_stacks === 4) {
                    word = word.substring(0, word.length - 1) + "볠";
                    oppState.lost_abilities = true; // 무기한
                    // (ㅅㅍㄴㅂ 종속 등은 생략하거나 별도 구현)
                    msgs.push("- 16턴 진입 궁극 효과 발동! [볠]로 고정되며 상대는 영구히 능력을 잃습니다.");
                }
            }
        }

        // 사신 [처형]
        if (state.job === "사신" && !isAbilityDisabled) {
            state.execution_count -= word.length;
            if (word.length >= 8) {
                oppState.disabled_turns = Math.max(oppState.disabled_turns, 1);
                oppState.no_hanbang_turns = Math.max(oppState.no_hanbang_turns, 1);
                oppState.no_yudo_turns = Math.max(oppState.no_yudo_turns, 1);
                msgs.push("▶ 사신 [처형식] 거행! 상대는 1턴간 능력 및 예외단어 사용 불가.");
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

        if (state.dino_swallowed) state.dino_swallowed = false;
        if (state.tail_active) state.tail_active = false;
        if (state.slice_active) state.slice_active = false;

        // 수학자 연산 시도 마커 해제
        if (oppState && oppState.job === "마하트마간디" && state.used_active_this_turn) {
            oppState.gandhi_stacks++;
            msgs.push("▶ 마하트마간디 [비폭력] (스킬 사용 조건): 스택 증가 (현재: " + oppState.gandhi_stacks + ")");
            state.used_active_this_turn = false;
        } else if (state.used_active_this_turn) {
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
