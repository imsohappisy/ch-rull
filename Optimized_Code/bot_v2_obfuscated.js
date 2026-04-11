const bot = BotManager.getCurrentBot();
let PREFIX = "1";
let INPUT_PFX = "0";
let ADMIN_PFX = ".dev";
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
const KILL_FILE_PATH = SD_PATH + "/msgbotr/killword.json";
const DIESYL_FILE_PATH = SD_PATH + "/msgbotr/diesyl.json";
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
function decomposeSyllable(char) {
    const hangulBase = 0xac00;
    const choseongList = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    const jungseongList = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
    const jongseongList = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    const code = char.charCodeAt(0) - hangulBase;
    if (code < 0 || code > 11171) return null;
    const ci = Math.floor(code / 588);
    const ji = Math.floor((code % 588) / 28);
    const gi = code % 28;
    return { chosung: choseongList[ci], jungsung: jungseongList[ji], jongsung: jongseongList[gi], ci: ci, ji: ji, gi: gi };
}
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
    let state = { job: job, _0x0034: false, _0x0036: 0, _0x0046: 0, _0x001c: 0, _0x002b: 0, _0x002a: 0, _0x0032: 0, _0x000e: 0, _0x002e: 0 };
    if (job === "해커") {
        state._0x003a = 0; state._0x0069 = 0; state._0x004f = 0;
        state._0x006d = 0;
        state._0x0013 = 0; state._0x0047 = 0; state._0x0028 = 0;
    }
    else if (job === "투자자") {
        state._0x0033 = 20; state._0x000d = 0; state._0x002c = 0; state._0x0016 = false;
    }
    else if (job === "환자") {
        state._0x003e = 0;
        state._0x0012 = 0; state._0x0002 = 0;
    }
    else if (job === "수집가") {
        state._0x0009 = [];
        state._0x0040 = 0;
        state._0x0045 = 0; state._0x0073 = 0; state._0x0059 = 0;
    }
    else if (job === "감시자") {
        state._0x005f = 30;
        state._0x0023 = 0; state._0x0061 = 0; state._0x000c = 0;
    }
    else if (job === "뜀틀선수") {
        state._0x0039 = 0; state._0x006a = 0; state._0x0079 = 3;
        state._0x0064 = 0;
    }
    else if (job === "전우치") {
        state._0x0022 = 0;
        state._0x0011 = 0; state._0x0038 = 0;
    }
    else if (job === "기관사") {
        state._0x0037 = 8;
    }
    else if (job === "늑대인간") {
        state._0x0048 = 0;
    }
    else if (job === "시프터") {
        state._0x0071 = 0;
    }
    else if (job === "비밀요원") {
        state._0x0082 = []; state._0x000b = 0;
        state._0x001a = 0; state._0x004e = 0;
    }
    else if (job === "67") {
        state._0x0008 = 0;
    }
    else if (job === "사과") {
        state._0x0001 = 0; state._0x0010 = 0; state._0x000f = 0;
        state._0x006b = 0;
    }
    else if (job === "시인") {
        state._0x0018 = 0; state._0x0042 = 0;
        state._0x0004 = 0; state._0x0014 = 0;
    }
    else if (job === "공룡") {
        state._0x001f = 0; state._0x0054 = 0; state._0x0035 = false;
        state._0x0060 = 0;
        state._0x0078 = 0; state._0x005e = false;
    }
    else if (job === "마법사") {
        state._0x004b = 0; state._0x0077 = 0;
        state._0x0030 = 0;
    }
    else if (job === "사신") {
        state._0x0024 = 44;
        state._0x003b = 0; state._0x006c = 0;
    }
    else if (job === "수학자") {
        state._0x005c = 0;
        state._0x0043 = 0; state._0x0076 = 0;
        state._0x0058 = 0; state._0x007b = 0;
        state._0x0080 = 0;
        state._0x007f = 0;
        state._0x001d = 0; state._0x0050 = 0; state._0x0003 = false;
        state._0x0049 = 0;
    }
    else if (job === "생존자") {
        state._0x0026 = 0; state._0x002d = "";
        state._0x0025 = 0; state._0x0066 = 0;
        state._0x0005 = 0;
    }
    else if (job === "악당") {
        state._0x001b = 0; state._0x0052 = 0; state._0x004a = 0; state._0x0020 = [];
        state._0x001e = 0; state._0x0057 = 0;
    }
    else if (job === "기자") {
        state._0x0027 = 0; state._0x0062 = 0; state._0x0056 = 0;
    }
    else if (job === "검객") {
        state._0x003f = 0; state._0x0074 = 0;
        state._0x0031 = 0; state._0x006e = 0; state._0x0051 = false;
    }
    else if (job === "마하트마간디") {
        state._0x0021 = 0; state._0x003d = 0;
        state._0x0017 = 0;
    }
    else if (job === "은하계전사") {
        state._0x0044 = 0; state._0x005a = 0; state._0x000a = false;
    }
    else if (job === "수리사") {
        state._0x0006 = 0;
        state._0x0029 = 0; state._0x0065 = 0; state._0x004c = false;
    }
    return state;
}
const ALL_JOBS = ["해커", "투자자", "환자", "수집가", "감시자", "뜀틀선수", "전우치", "기관사", "늑대인간", "시프터", "비밀요원", "67", "사과", "시인", "공룡", "마법사", "사신", "수학자", "생존자", "악당", "기자", "검객", "마하트마간디", "은하계전사", "수리사"];
function nextCharForWord(game) {
    if (game.history.length === 0) return "자유";
    return game._0x006f.s1 !== game._0x006f.s2 ?
                   game._0x006f.s2 + "(" + game._0x006f.s1 + ")" : game._0x006f.s2;
}
function buildStatusMsg(game) {
    let nextChar = game._0x006f.s1 !== game._0x006f.s2 ?
                   game._0x006f.s2 + "(" + game._0x006f.s1 + ")" : game._0x006f.s2;
    if (game.history.length === 0) nextChar = "자유";
    let historyStr = game.history.length > 0 ? game.history.join(" ") : "없음";
    let currentPlayer = game.players[game._0x0019];
    let nextPlayer = game.players[(game._0x0019 + 1) % 2];
    let curState = game._0x004d[currentPlayer];
    let nxtState = game._0x004d[nextPlayer];
    function makePlayerInfo(name, state, otherState) {
        let buff = [];
        let debuff = [];
        let etc = [];
        let title = name + " [" + state.job + "]";
        let _0x0063 = [];
        if (state.job === "해커") {
            _0x0063.push("조작 " + (3 - state._0x0069) + "회/쿨 " + state._0x003a + "턴");
            _0x0063.push("복제 " + (1 - state._0x006d) + "회");
            _0x0063.push("초토화 " + (2 - state._0x0047) + "회/쿨 " + state._0x0013 + "턴");
            if (state._0x004f > 0) buff.push("- 조작 활성화: " + state._0x004f + "턴간 중복 단어 가능");
            if (state._0x0028 > 0) buff.push("- 초토화 장전: 다음 턴 발동");
        } else if (state.job === "투자자") {
            _0x0063.push("주가 조작 " + (2 - state._0x002c) + "회/쿨 " + state._0x000d + "턴");
            etc.push("- 현재 주가: " + state._0x0033 + " / 타겟: " + game._0x0075);
            if (state._0x0016) buff.push("- 주가 조작 장전: 다음 턴 강제 차감");
        } else if (state.job === "환자") {
            _0x0063.push("강박증 쿨 " + state._0x003e + "턴");
            _0x0063.push("환각증 " + (1 - state._0x0012) + "회");
            if (state._0x0002 > 0) debuff.push("- 환각증 여파: " + state._0x0002 + "턴간 예외단어(한방/유도) 불가");
        } else if (state.job === "수집가") {
            _0x0063.push("제작 쿨 " + state._0x0040 + "턴");
            _0x0063.push("채굴 " + (2 - state._0x0073) + "회/쿨 " + state._0x0045 + "턴");
            etc.push("- 수집된 음절: [" + state._0x0009.join(", ") + "]");
            if (state._0x0059 > 0) buff.push("- 채굴 활성화: 1턴간 모든 음절 수집");
        } else if (state.job === "감시자") {
            _0x0063.push("탐지 " + (2 - state._0x0061) + "회/쿨 " + state._0x0023 + "턴");
            etc.push("- 현재 감시 수: " + state._0x005f);
            if (state._0x000c > 0) buff.push("- 탐지 활성화: 다음 감시 패시브 2배");
        } else if (state.job === "뜀틀선수") {
            _0x0063.push("뜀틀 " + (state._0x0079 - state._0x006a) + "회/쿨 " + state._0x0039 + "턴");
            _0x0063.push("허들 넘기 " + (1 - state._0x0064) + "회");
        } else if (state.job === "전우치") {
            _0x0063.push("잔상 " + (1 - state._0x0022) + "회");
            _0x0063.push("직격뢰 " + (4 - state._0x0038) + "회/쿨 " + state._0x0011 + "턴");
        } else if (state.job === "기관사") {
            etc.push("- 남은 전철역 수: " + state._0x0037);
        } else if (state.job === "늑대인간") {
            _0x0063.push("포효 쿨 " + state._0x0048 + "턴");
        } else if (state.job === "시프터") {
            _0x0063.push("시프트 " + (3 - state._0x0071) + "회");
        } else if (state.job === "비밀요원") {
            _0x0063.push("포획 " + (2 - state._0x004e) + "회/쿨 " + state._0x001a + "턴");
            etc.push("- 설정된 타깃 수: " + state._0x0082.length + (state._0x0082.length > 0 ? " [" + state._0x0082.join(",") + "]" : ""));
        } else if (state.job === "67") {
            _0x0063.push("67 쿨 " + state._0x0008 + "턴");
        } else if (state.job === "사과") {
            _0x0063.push("사구아 " + (1 - state._0x006b) + "회");
            etc.push("- 삭와 미사용 지속: " + state._0x000f + "턴 / (쿨: " + state._0x0001 + ")");
            if (state._0x0010 > 0) debuff.push("- 사과 디버프: " + state._0x0010 + "턴간 3글자 이상 한방 및 5글자 이상 유도 불가");
        } else if (state.job === "시인") {
            _0x0063.push("2음절 " + (3 - state._0x0042) + "회/쿨 " + state._0x0018 + "턴");
            _0x0063.push("시적 허용 " + (2 - state._0x0014) + "회/쿨 " + state._0x0004 + "턴");
        } else if (state.job === "공룡") {
            _0x0063.push("삼키기 " + (2 - state._0x0054) + "회/쿨 " + state._0x001f + "턴");
            _0x0063.push("브레스 " + (1 - state._0x0060) + "회, 꼬리 날리기 " + (1 - state._0x0078) + "회");
            if (state._0x005e) buff.push("- 꼬리 날리기: 다음 차례 능력 불가 무시");
        } else if (state.job === "마법사") {
            _0x0063.push("공허 " + (5 - state._0x0077) + "회/쿨 " + state._0x004b + "턴");
            _0x0063.push("폭발 " + (1 - state._0x0030) + "회");
            if (game._0x0075 <= 14) debuff.push("- 부작용: 14턴 이전까지 한방/유도 불가");
        } else if (state.job === "사신") {
            _0x0063.push("사형 선고 " + (4444 - state._0x006c) + "회/쿨 " + state._0x003b + "턴");
            etc.push("- 남은 처형 수: " + state._0x0024);
        } else if (state.job === "수학자") {
            _0x0063.push("계산 " + (2 - state._0x0076) + "회/쿨 " + state._0x0043 + "턴");
            _0x0063.push("덧셈 " + (3 - state._0x007b) + "회/쿨 " + state._0x0058 + "턴");
            _0x0063.push("뺄셈 " + (2 - state._0x0080) + "회, 곱셈 " + (1 - state._0x007f) + "회");
            _0x0063.push("교정 " + (2 - state._0x0050) + "회/쿨 " + state._0x001d + "턴, 미적분 " + (1 - state._0x0049) + "회");
        } else if (state.job === "생존자") {
            _0x0063.push("긴급 구조 " + (2 - state._0x0066) + "회/쿨 " + state._0x0025 + "턴");
            etc.push("- 모스부호: [" + state._0x002d + "]");
        } else if (state.job === "악당") {
            _0x0063.push("결계 " + (4 - state._0x0052) + "회/쿨 " + state._0x001b + "턴");
            _0x0063.push("왜곡 " + (2 - state._0x0057) + "회/쿨 " + state._0x001e + "턴");
            if (state._0x004a > 0) buff.push("- 결계 전개 중 (" + state._0x004a + "턴 남음) : [" + state._0x0020.join(",") + "]");
        } else if (state.job === "기자") {
            _0x0063.push("거짓 보도 " + (4 - state._0x0062) + "회/쿨 " + state._0x0027 + "턴");
            if (state._0x0056 > 0) buff.push("- 방송 중: 상대방 패시브/능력/두음법칙 불가 (" + state._0x0056 + "턴 남음)");
        } else if (state.job === "검객") {
            _0x0063.push("찌르기 " + (2 - state._0x0074) + "회/쿨 " + state._0x003f + "턴");
            _0x0063.push("가르기 " + (3 - state._0x006e) + "회/쿨 " + state._0x0031 + "턴");
        } else if (state.job === "마하트마간디") {
            _0x0063.push("비폭력 스탯 쿨 " + state._0x0021 + "턴, 억제 쿨 " + state._0x0017 + "턴");
            etc.push("- 비폭력 스탯: " + state._0x003d);
        } else if (state.job === "은하계전사") {
            _0x0063.push("별달 패시브 쿨 " + state._0x0044 + "턴");
            etc.push("- 별달 스택: " + state._0x005a);
        } else if (state.job === "수리사") {
            _0x0063.push("수리 " + (4 - state._0x0065) + "회/쿨 " + state._0x0029 + "턴");
        }
        if (state._0x0036 > 0) debuff.push("- 능력/패시브 상실 상태 (" + state._0x0036 + "턴 남음)");
        if (state._0x0034) debuff.push("- 능력 영구 상실 상태");
        if (state._0x0046 > 0) debuff.push("- 유도단어 불가 (" + state._0x0046 + "턴 남음)");
        if (state._0x001c > 0) debuff.push("- 한방단어 불가 (" + state._0x001c + "턴 남음)");
        if (state._0x002b > 0) debuff.push("- 두음법칙 불가 (" + state._0x002b + "턴 남음)");
        if (state._0x002a > 0) debuff.push("- 짝수 글자 수 단어만 허용 (" + state._0x002a + "턴 남음)");
        if (state._0x000e > 0) debuff.push("- 2글자 단어만 허용 (" + state._0x000e + "턴 남음)");
        if (state._0x002e > 0) debuff.push("- " + state._0x002e + "글자 이하 단어만 허용");
        if (state._0x000b > 0) debuff.push("- 비밀요원 타깃 포착 중 (" + state._0x000b + "턴 남음, 5글자 이상 금지)");
        if (otherState && otherState.job === "해커" && otherState._0x0028 > 0) {
            debuff.push("- 초토화 위협: 4글자 이상 사용 시 능력 상실");
        }
        return title + "\n\n[ 버프 ]\n" + (buff.length > 0 ? buff.join("\n") : "없음") + "\n\n" +
               "[ 디버프 ]\n" + (debuff.length > 0 ? debuff.join("\n") : "없음") + "\n\n" +
               "[ 기타 ]\n" + (etc.length > 0 ? etc.join("\n") : "없음");
    }
    let msg = "기보\n\n" + historyStr + "\n\n" +
              game._0x0075 + "턴 | 채린룰 | 이을 음절 : " + nextChar + "\n\n" +
              "차례 : " + currentPlayer + " [" + curState.job + "]\n\n\n" +
              "< 서로의 상태 >\n\n" +
              makePlayerInfo(currentPlayer, curState, nxtState) + "\n\n\n\n" +
              makePlayerInfo(nextPlayer, nxtState, curState);
    return msg;
}
bot.addListener(Event.MESSAGE, function(event) {
    let room = event.room;
    let msg = event.content;
    let sender = event.author.name;
    let isGroupChat = event.isGroupChat;
    let replier = {
        reply: function(text) {
            event.reply(text);
        }
    };
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
    if (msg === "ㅈㅈ" && (!game || !game.players.includes(sender))) return;
    if (game) {
        let now = Date.now();
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
        if ((msg === PREFIX + "킥" || msg === PREFIX + "ㅋ") && (!game.kickVote || !game.kickVote.target) && game._0x0019 !== -1) {
            let target = game.players[game._0x0019];
            let timeDiff = now - game._0x0055;
            if (timeDiff >= 3 * 60 * 60 * 1000) {
                replier.reply(target + "님이 3시간 이상 잠수하여 즉시 강퇴되었습니다.");
                let winner = game.players.find(p => p !== target);
                replier.reply("게임 종료\n승자: " + winner);
                delete games[room];
                return;
            } else if (timeDiff >= 2 * 60 * 1000) {
                game.kickVote = { target: target, startTime: now };
                replier.reply("잠수로 판정되어 1킥이 발동되었습니다.\n" + target + "님은 15초 내로 아무 채팅이나 치지 않으면 패배합니다.");
                return;
            } else {
                { replier.reply("아직 잠수(2분 초과) 상태가 아닙니다."); return; }
            }
        }
    }
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
                    game._0x006f.s1 = applyDuEum(lastChar);
                    game._0x006f.s2 = lastChar;
                    game._0x0019 = (game._0x002f + game.history.length) % 2;
                    game._0x0075 = Math.floor(game.history.length / 2) + 1;
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
    if (msg === PREFIX + "무효" || msg === PREFIX + "ㅁㅎ") {
        if (!game || !game.started || game.phase !== "playing") return;
        game.isWaitingVote = true;
        game.voteType = "무효";
        game.requester = sender;
        replier.reply(sender + "님이 무효를 요청했습니다.\n상대방은 " + PREFIX + "동의 또는 " + PREFIX + "거절을 입력하세요.");
        return;
    }
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
    if (msg === PREFIX + "바꾸기" || msg === PREFIX + "ㅂㄲㄱ") {
        if (!game || !game.started || game.phase !== "playing") return;
        if (game.players.includes(sender)) {
            if (game.history.length === 1 && sender !== game.players[game._0x002f]) {
                game._0x002f = game.players.indexOf(sender);
                game._0x0019 = (game._0x002f + 1) % 2;
                replier.reply(sender + "님이 '" + game.history[0] + "' 단어를 빼앗아 처음 입장을 가져갔습니다.\n다음 차례: " + game.players[game._0x0019]);
            } else {
                replier.reply("바꾸기는 상대방이 첫 턴 단어를 제출한 직후에만 사용할 수 있습니다.");
            }
        }
        return;
    }
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
    if (msg === PREFIX + "상태" || msg === PREFIX + "ㅅㅌ") {
        if (!game || !game.started) { replier.reply("진행 중인 게임 없음"); return; }
        if (game.phase !== "playing") { replier.reply("현재 대기 혹은 직업 선택 중입니다."); return; }
        replier.reply(buildStatusMsg(game)); return;
    }
    if (msg === PREFIX + "채린" || msg === PREFIX + "ㅊㄹ") {
        if (!WORD_SET) { replier.reply("단어 로드 필요 (.dev listload)"); return; }
        if (!games[room]) {
            games[room] = {
                phase: "waiting", players: [], started: false, used: new Set(), history: [],
                _0x0075: 1, _0x0019: -1, _0x002f: -1,
                _0x006f: { s1: "", s2: "" },
                isWaitingVote: false, voteType: null, targetWord: null, requester: null,
                _0x0055: Date.now(),
                kickVote: { target: null, startTime: null },
                _0x004d: {}
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
    if ((msg.startsWith(PREFIX + "직업 ") || msg.startsWith(PREFIX + "ㅈㅇ ")) && game && game.phase === "job_selection") {
        if (!game.players.includes(sender)) return;
        let job = msg.replace(PREFIX + "직업 ", "").replace(PREFIX + "ㅈㅇ ", "").trim();
        if (job === "ㅎㅋ") job = "해커";
        if (job === "ㅌㅈㅈ") job = "투자자";
        if (!ALL_JOBS.includes(job)) { replier.reply("존재하지 않거나 선택할 수 없는 직업입니다."); return; }
        if (game._0x004d[sender]) { replier.reply("이미 직업을 선택하셨습니다."); return; }
        game._0x004d[sender] = initJobState(job);
        replier.reply(sender + "님 -> [" + job + "] 선택 완료");
        if (Object.keys(game._0x004d).length === 2) {
            game.phase = "playing";
            game._0x0055 = Date.now();
            let p1 = game.players[0];
            let p2 = game.players[1];
            let p1_job = game._0x004d[p1].job;
            let p2_job = game._0x004d[p2].job;
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
    if (msg.startsWith("2") && msg.length > 1) {
        if (!game || game.phase !== "playing" || !game.players.includes(sender)) return;
        let abilityStr = msg.substring(1).trim();
        let _0x0053 = abilityStr.split(" ");
        let ability = _0x0053[0];
        if (_0x0053.length > 1 && (ability === "주가" || ability === "거짓" || ability === "시적" || ability === "꼬리" || ability === "사형" || ability === "긴급" || ability === "허들")) {
            ability = _0x0053[0] + " " + _0x0053[1];
            _0x0053.shift();
        }
        let _0x005d = _0x0053.length > 1 ? _0x0053.slice(1).join(" ") : null;
        let state = game._0x004d[sender];
        let _0x0015 = state._0x0036 > 0 || state._0x0034;
        let _0x007c = (game.players.indexOf(sender) + 1) % 2;
        let _0x007d = game._0x004d[game.players[_0x007c]];
        if (state.job === "해커") {
            if (ability === "조작" && !_0x0015) {
                if (state._0x0069 >= 3) { replier.reply("조작 능력을 모두 사용했습니다."); return; }
                if (state._0x003a > 0) { replier.reply("조작 쿨타임입니다. (" + state._0x003a + "턴 남음)"); return; }
                state._0x0069 += 1; state._0x003a = 4; state._0x004f = 2;
                replier.reply("[해커] <조작> 발동!\n- 이후 2턴간 이미 사용했던 단어를 재사용할 수 있습니다.");
            } else if (ability === "복제" && !_0x0015) {
                if (game._0x0075 < 7) { replier.reply("복제 능력은 7턴 이후부터 사용할 수 있습니다."); return; }
                if (state._0x006d >= 1) { replier.reply("복제 능력을 모두 사용했습니다."); return; }
                state._0x006d += 1;
                let _0x0072 = {
                    _0x0036: state._0x0036, _0x0046: state._0x0046, _0x001c: state._0x001c,
                    _0x002b: state._0x002b, _0x002a: state._0x002a, _0x0032: state._0x0032,
                    _0x000e: state._0x000e, _0x002e: state._0x002e, _0x000b: state._0x000b
                };
                Object.assign(_0x007d, _0x0072);
                Object.keys(_0x0072).forEach(k => state[k] = 0);
                replier.reply("[해커] <복제> 발동!\n- 내 모든 디버프를 제거하고 상대방에게 전송했습니다.");
            } else if (ability === "초토화" && !_0x0015) {
                if (game._0x0075 < 7) { replier.reply("초토화 능력은 7턴 이후부터 사용할 수 있습니다."); return; }
                if (state._0x0047 >= 2) { replier.reply("초토화 능력을 모두 사용했습니다."); return; }
                if (state._0x0013 > 0) { replier.reply("초토화 쿨타임입니다. (" + state._0x0013 + "턴 남음)"); return; }
                state._0x0047 += 1; state._0x0013 = 7; state._0x0028 = 1;
                replier.reply("[해커] <초토화> 예약 발동!\n- 1턴 내 상대방이 4글자 이상의 단어를 사용하면 모든 능력을 잃습니다.");
            }
        }
        else if (state.job === "투자자" && !_0x0015) {
            if (ability === "주가 조작") {
                if (state._0x002c >= 2) { replier.reply("주가 조작를 모두 사용했습니다."); return; }
                if (state._0x000d > 0) { replier.reply("주가 조작 쿨타임입니다."); return; }
                state._0x002c += 1; state._0x000d = 7; state._0x0016 = true;
                replier.reply("[투자자] <주가 조작> 예약 발동!\n- 다음 턴 상대방이 제출하는 단어는 길이 상관없이 무조건 주가를 폭락시킵니다.");
            }
        }
        else if (state.job === "수집가" && !_0x0015) {
            if (ability === "제작") {
                if (!_0x005d || _0x005d.length < 2) { replier.reply("2글자 이상의 추가단어를 지정해야 합니다."); return; }
                if (state._0x0040 > 0) { replier.reply("제작 쿨타임입니다."); return; }
                let _0x0041 = state._0x0009.slice();
                let possible = true;
                for (let ch of _0x005d) {
                    let idx = _0x0041.indexOf(ch);
                    if (idx > -1) _0x0041.splice(idx, 1);
                    else { possible = false; break; }
                }
                if (!possible) { replier.reply("해당 단어를 제작하기 위한 수집 한글 음절이 부족합니다."); return; }
                state._0x0009 = _0x0041;
                state._0x0040 = 6;
                if (!game._0x0067) game._0x0067 = new Set();
                game._0x0067.add(_0x005d);
                replier.reply("[수집가] 추가단어 제작 성공! 이제 '" + _0x005d + "' 단어를 사용할 수 있습니다.");
            } else if (ability === "채굴") {
                if (state._0x0073 >= 2) { replier.reply("채굴을 모두 사용했습니다."); return; }
                if (state._0x0045 > 0) { replier.reply("채굴 쿨타임입니다."); return; }
                state._0x0073++; state._0x0045 = 6; state._0x0059 = 1;
                replier.reply("[수집가] 채굴 발동! 1턴간 상대방이 사용한 단어의 모든 음절을 수집합니다.");
            }
        }
        else if (state.job === "환자") {
            if (ability === "환각증" && !_0x0015) {
                if (game._0x0075 < 7) { replier.reply("환각증 능력은 7턴 이후부터 사용할 수 있습니다."); return; }
                if (state._0x0012 >= 1) { replier.reply("환각증을 모두 사용했습니다."); return; }
                if (game.history.length > 0 && !isRoot(game.history[game.history.length-1])) {
                    replier.reply("환각증은 루트단어를 받았을 때만 사용할 수 있습니다."); return;
                }
                state._0x0012++;
                state._0x0002 = 2;
                state._0x002e = 3;
                _0x007d._0x0007 = true;
                replier.reply("[환자] 환각증 발동! 상대는 1턴간 앞말잇기를 해야합니다.");
            }
        }
        else if (state.job === "감시자" && !_0x0015) {
            if (ability === "탐지") {
                if (state._0x0061 >= 2) { replier.reply("탐지를 모두 사용했습니다."); return; }
                if (state._0x0023 > 0) { replier.reply("탐지 쿨타임입니다."); return; }
                state._0x0061++; state._0x0023 = 6;
                state._0x000c = 1;
                replier.reply("[감시자] 탐지 발동! 다음 패시브 발동 시 2배 차감.");
            }
        }
        else if (state.job === "뜀틀선수" && !_0x0015) {
            if (ability === "허들 넘기") {
                if (game._0x0075 < 22) { replier.reply("허들 넘기는 22턴 이상부터 사용 가능합니다."); return; }
                if (state._0x0064 >= 1) { replier.reply("허들 넘기 능력을 모두 사용했습니다."); return; }
                state._0x0064++;
                state._0x0079++; state._0x0039 = 0;
                replier.reply("[뜀틀선수] 허들 넘기 발동! 뜀틀 기회 +1 및 쿨타임 초기화.");
            }
        }
        else if (state.job === "전우치" && !_0x0015) {
            if (ability === "직격뢰") {
                if (state._0x0038 >= 4) { replier.reply("직격뢰 능력을 모두 사용했습니다."); return; }
                if (state._0x0011 > 0) { replier.reply("직격뢰 쿨타임입니다."); return; }
                if (!_0x005d) { replier.reply("대상을 지정해주세요."); return; }
                state._0x0038++; state._0x0011 = 7;
                if (!game._0x005b) game._0x005b = new Set();
                game._0x005b.add(_0x005d);
                replier.reply("[전우치] 직격뢰! '" + _0x005d + "' 단어가 완전히 소멸했습니다.");
            }
        }
        else if (state.job === "시프터" && !_0x0015) {
            if (ability === "시프트") {
                if (state._0x0071 >= 3) { replier.reply("시프트를 모두 사용했습니다."); return; }
                const vowelSeq = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
                let _0x0084 = decomposeSyllable(game._0x006f.s2);
                if (!_0x0084) { replier.reply("분해 불가"); return; }
                let curIdx = vowelSeq.indexOf(_0x0084.jungsung);
                if (curIdx === -1 || curIdx === vowelSeq.length - 1) { replier.reply("더 넘길 모음이 없습니다."); return; }
                _0x0084.jungsung = vowelSeq[curIdx + 1];
                let nextList = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
                let _0x0081 = composeSyllable(_0x0084.ci, nextList.indexOf(_0x0084.jungsung), _0x0084.gi);
                game._0x006f.s1 = _0x0081;
                game._0x006f.s2 = _0x0081;
                state._0x0071++;
                replier.reply("[시프터] 시프트 발동! 이을 음절 모음이 이동하여 '" + _0x0081 + "' (으)로 변경되었습니다.");
            }
        }
        else if (state.job === "비밀요원" && !_0x0015) {
            if (ability === "포획") {
                if (state._0x004e >= 2) { replier.reply("포획을 모두 사용했습니다."); return; }
                if (state._0x001a > 0) { replier.reply("포획 쿨타임입니다."); return; }
                if (!_0x005d || _0x005d.length !== 1) { replier.reply("포획할 대상 은 1음절이어야 합니다."); return; }
                _0x007d._0x0036 = Math.max(_0x007d._0x0036, 2);
                state._0x004e++; state._0x001a = 3;
                replier.reply("[비밀요원] 포획 발동! '" + _0x005d + "' 로 시작하는 유도/루트 단어가 4개 소멸했으며, 상대방은 2턴간 패시브 및 능력 불가.");
            }
        }
        else if (state.job === "사과" && !_0x0015) {
            if (ability === "사구아") {
                if (state._0x006b >= 1) { replier.reply("사구아 능력을 모두 사용했습니다."); return; }
                state._0x006b++;
                _0x007d._0x0036 = Math.max(_0x007d._0x0036, 3);
                replier.reply("[사과] 사구아 발동! 상대는 3턴간 패시브 및 능력을 잃습니다.");
            }
        }
        else if (state.job === "시인" && !_0x0015) {
            if (ability === "2음절") {
                if (state._0x0042 >= 3) { replier.reply("2음절 능력을 모두 사용했습니다."); return; }
                if (state._0x0018 > 0) { replier.reply("2음절 쿨타임입니다."); return; }
                state._0x0042++; state._0x0018 = 2;
                _0x007d._0x000e = Math.max(_0x007d._0x000e, 1);
                replier.reply("[시인] 2음절 발동! 상대방은 1턴간 2글자 단어만 사용할 수 있습니다.");
            } else if (ability === "시적 허용") {
                if (state._0x0014 >= 2) { replier.reply("시적 허용 능력을 모두 사용했습니다."); return; }
                if (state._0x0004 > 0) { replier.reply("시적 허용 쿨타임입니다."); return; }
                state._0x0014++; state._0x0004 = 3;
                _0x007d._0x002b = Math.max(_0x007d._0x002b, 1);
                replier.reply("[시인] 시적 허용 발동! 상대방은 1턴간 두음법칙을 사용할 수 없습니다.");
            }
        }
        else if (state.job === "공룡" && !_0x0015) {
            if (ability === "삼키기") {
                if (state._0x0054 >= 2) { replier.reply("삼키기를 모두 사용했습니다."); return; }
                if (state._0x001f > 0) { replier.reply("삼키기 쿨타임입니다."); return; }
                if (game.history.length < 2) { replier.reply("이전 단어가 부족합니다."); return; }
                game.history.pop();
                let lastValid = game.history[game.history.length - 1];
                let last = lastValid[lastValid.length - 1];
                game._0x006f.s1 = applyDuEum(last); game._0x006f.s2 = last;
                state._0x0054++; state._0x001f = 7; state._0x003c = true;
                replier.reply("[공룡] 삼키기 발동! 마지막 단어를 삼켜 이전 단어 '" + lastValid + "' 로 되돌렸습니다. 1턴간 3글자 이하 일반단어만 가능.");
            } else if (ability === "브레스") {
                if (game._0x0075 < 10) { replier.reply("10턴부터 사용 가능합니다."); return; }
                if (state._0x0060 >= 1) { replier.reply("브레스를 모두 사용했습니다."); return; }
                state._0x0060++;
                _0x007d._0x0046 = Math.max(_0x007d._0x0046, 1);
                replier.reply("[공룡] 브레스 발동! 상대 유도 금지.");
            } else if (ability === "꼬리 날리기") {
                if (game._0x0075 < 13) { replier.reply("13턴부터 사용 가능합니다."); return; }
                if (state._0x0078 >= 1) { replier.reply("꼬리 날리기를 모두 사용했습니다."); return; }
                state._0x0078++; state._0x005e = true;
                replier.reply("[공룡] 꼬리 날리기 발동! 다음 턴 능력 불가 상태 무시.");
            }
        }
        else if (state.job === "마법사" && !_0x0015) {
            if (ability === "공허") {
                if (state._0x0077 >= 5) { replier.reply("공허를 모두 사용했습니다."); return; }
                if (state._0x004b > 0) { replier.reply("공허 쿨타임입니다."); return; }
                let _0x0084 = decomposeSyllable(game._0x006f.s2);
                if (_0x0084 && _0x0084.gi > 0) {
                    let _0x0081 = composeSyllable(_0x0084.ci, _0x0084.ji, 0);
                    game._0x006f.s2 = _0x0081;
                    game._0x006f.s1 = applyDuEum(_0x0081);
                    state._0x0077++; state._0x004b = 4;
                    replier.reply("[마법사] 공허 발동! 종성이 지워져 '" + _0x0081 + "' 로 변경되었습니다.");
                } else {
                    replier.reply("종성이 없는 음절입니다.");
                }
            } else if (ability === "폭발") {
                if (game._0x0075 < 14) { replier.reply("14턴 이상 시 사용."); return; }
                if (state._0x0030 >= 1) { replier.reply("모두 사용."); return; }
                state._0x0036 = 0; state._0x0046 = 0; state._0x001c = 0; state._0x002b = 0;
                state._0x002a = 0; state._0x0032 = 0; state._0x000e = 0; state._0x002e = 0; state._0x000b = 0;
                state._0x0030++;
                replier.reply("[마법사] 폭발! 모든 디버프가 제거됩니다.");
            }
        }
        else if (state.job === "사신" && !_0x0015) {
            if (ability === "사형 선고") {
                if (state._0x006c >= 4444) return;
                if (state._0x003b > 0) { replier.reply("쿨타임입니다."); return; }
                state._0x006c++; state._0x003b = 4;
                if (state._0x0024 <= 4) {
                    replier.reply("[사신] 사형 선고 발동! (처형 수 4 이하) \n사신이 게임에서 승리합니다!");
                    delete games[room]; return;
                } else if (state._0x0024 <= 18) {
                    _0x007d._0x002e = Math.max(_0x007d._0x002e, 4);
                    replier.reply("[사신] 사형 선고 발동! 1턴간 상대방은 4글자 이하 단어를 사용할 수 없습니다. (>4 글자만 가능)");
                }
            }
        }
        else if (state.job === "수학자") {
            if (_0x0015) return;
            state._0x0003 = true;
            if (ability === "계산") {
                if (state._0x0076>=2) return;
                if (state._0x0043>0) return;
                state._0x0076++; state._0x0043=1;
                replier.reply("[수학자] 스킬 결과: " + state._0x005c);
                if (state._0x005c === 20) {
                    replier.reply("수학자가 게임에서 승리합니다!");
                    delete games[room]; return;
                }
            } else if (ability === "덧셈") {
                if (state._0x007b>=3) return;
                if (state._0x0058>0) return;
                if(game.history.length>0) state._0x005c += game.history[game.history.length-1].length;
                state._0x007b++; state._0x0058=2;
                replier.reply("[수학자] 덧셈 발동!");
            } else if (ability === "뺄셈") {
                if (state._0x0080>=2) return;
                if(game.history.length>0) state._0x005c -= game.history[game.history.length-1].length;
                state._0x0080++;
                replier.reply("[수학자] 뺄셈 발동!");
            } else if (ability === "곱셈") {
                if (state._0x007f>=1) return;
                if(game.history.length>0) state._0x005c *= game.history[game.history.length-1].length;
                state._0x007f++;
                replier.reply("[수학자] 곱셈 발동!");
            } else if (ability === "교정") {
                if (state._0x0050>=2) return;
                if (state._0x001d>0) return;
                state._0x005c += 1;
                state._0x0050++; state._0x001d=4;
                replier.reply("[수학자] 교정 발동!");
            } else if (ability === "미적분") {
                if (state._0x0049>=1) return;
                state._0x0049++;
                _0x007d._0x0036 = Math.max(_0x007d._0x0036, 1);
                replier.reply("[수학자] 미적분 발동! 상대 능력 무력화 1턴.");
            }
        }
        else if (state.job === "생존자" && !_0x0015) {
            if (ability === "긴급 구조") {
                if (state._0x0066 >= 2) return;
                if (state._0x0025 > 0) return;
                if (!isRoot(game.history[game.history.length-1]) && !isYudo(game.history[game.history.length-1])) return;
                let newHist = [];
                for(let i=game.history.length-1; i>=2; i--) {
                    let w = game.history[i];
                    newHist.push(w.split('').reverse().join(''));
                }
                game.history = newHist;
                let lastValid = game.history[game.history.length-1];
                let last = lastValid[lastValid.length-1];
                game._0x006f.s1 = applyDuEum(last); game._0x006f.s2 = last;
                state._0x0066++; state._0x0025 = 7;
                state._0x0005 = 1;
                state._0x0036 = 0; state._0x0046 = 0; state._0x001c = 0; state._0x002b = 0;
                replier.reply("[생존자] 긴급 구조 발동! 모든 기보가 교체되고 디버프가 제거됩니다. 변경된 마지막 단어: " + lastValid);
            }
        }
        else if (state.job === "악당" && !_0x0015) {
            if (ability === "결계") {
                if (state._0x0052 >= 4) return;
                if (state._0x001b > 0) return;
                let dur = game.history.length>0 ? game.history[game.history.length-1].length : 2;
                state._0x0052++; state._0x001b = 5;
                state._0x004a = dur;
                state._0x0020 = ["ㄱ","ㄴ"];
                replier.reply("[악당] " + dur + "턴 간 지속되는 결계 생성!");
            } else if (ability === "왜곡") {
                if (state._0x0057 >= 2 || state._0x004a === 0) return;
                if (state._0x001e > 0) return;
                state._0x0057++; state._0x001e = 1;
                let dict = {"ㄱ":"ㅎ", "ㄴ":"ㅍ", "ㄷ":"ㅌ", "ㄹ":"ㅋ"};
                for(let i=0; i<state._0x0020.length; i++) {
                    if(dict[state._0x0020[i]]) state._0x0020[i] = dict[state._0x0020[i]];
                }
                if (state._0x0020.length >= 4) _0x007d._0x0036 = Math.max(_0x007d._0x0036, 1);
                replier.reply("[악당] 왜곡 발생!");
            }
        }
        else if (state.job === "기자" && !_0x0015) {
            if (ability === "거짓 보도") {
                if (state._0x0062 >= 4) return;
                if (state._0x0027 > 0) return;
                state._0x0062++; state._0x0027 = 3; state._0x0056 = 1;
                _0x007d._0x0036 = Math.max(_0x007d._0x0036, 1);
                _0x007d._0x002b = Math.max(_0x007d._0x002b, 1);
                replier.reply("[기자] 거짓 보도 방송 1턴 전개!");
            }
        }
        else if (state.job === "검객" && !_0x0015) {
            if (ability === "찌르기") {
                if (game._0x0075 < 5) return;
                if (state._0x0074 >= 2) return;
                if (state._0x003f > 0) return;
                state._0x0074++; state._0x003f = 5;
                _0x007d._0x0036 = Math.max(_0x007d._0x0036, 1);
                _0x007d._0x002b = Math.max(_0x007d._0x002b, 1);
                replier.reply("[검객] 찌르기 발동!");
            } else if (ability === "가르기") {
                if (state._0x006e >= 3 || state._0x0031 > 0) return;
                if (game.history.length === 0) return;
                let lastw = game.history[game.history.length-1];
                let _0x0084 = decomposeSyllable(lastw[lastw.length-1]);
                if (_0x0084.gi > 0) {
                    game._0x006f.s2 = composeSyllable(_0x0084.ci, 0, _0x0084.gi);
                } else {
                    game._0x006f.s2 = composeSyllable(_0x0084.ci, _0x0084.ji, 0);
                }
                game._0x006f.s1 = game._0x006f.s2;
                state._0x006e++; state._0x0031 = 3;
                if (game._0x0075 < 12) state._0x0051 = true;
                replier.reply("[검객] 가르기 발동! 이을 글자 파편 변경됨: " + game._0x006f.s2);
            }
        }
        else if (state.job === "마하트마간디" && !_0x0015) {
            if (ability === "억제") {
                if (state._0x003d < 1) return;
                if (state._0x0017 > 0) return;
                state._0x003d--; state._0x0017 = 3;
                _0x007d._0x0046 = Math.max(_0x007d._0x0046, 1);
                replier.reply("[마하트마간디] 억제 발동! 상대 1턴간 유도 불가.");
            }
        }
        else if (state.job === "수리사" && !_0x0015) {
            if (ability === "수리") {
                if (state._0x0065 >= 4) return;
                if (state._0x0029 > 0) return;
                let _0x0084 = decomposeSyllable(game._0x006f.s2);
                const swapMap = {"ㅏ":"ㅜ", "ㅑ":"ㅠ", "ㅓ":"ㅗ", "ㅕ":"ㅛ", "ㅣ":"ㅡ", "ㅜ":"ㅏ", "ㅠ":"ㅑ", "ㅗ":"ㅓ", "ㅛ":"ㅕ", "ㅡ":"ㅣ"};
                if (_0x0084 && swapMap[_0x0084.jungsung]) {
                    let JungList = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
                    let _0x0081 = composeSyllable(_0x0084.ci, JungList.indexOf(swapMap[_0x0084.jungsung]), _0x0084.gi);
                    game._0x006f.s2 = _0x0081;
                    game._0x006f.s1 = applyDuEum(_0x0081);
                    state._0x0065++; state._0x0029 = 6; state._0x0046 = Math.max(state._0x0046, 1);
                    replier.reply("[수리사] 수리 완료! '" + _0x0081 + "' (으)로 변경되며 1턴 유도 불가.");
                } else {
                    replier.reply("수리할 수 없는 모음입니다.");
                }
            }
        }
        return;
    }
    if (msg.startsWith(INPUT_PFX)) {
        if (!game || game.phase !== "playing") return;
        let word = msg.substring(INPUT_PFX.length).trim();
        if (word.length < 2) return;
        if (game._0x0019 !== -1 && sender !== game.players[game._0x0019]) {
            replier.reply(sender + "님의 차례가 아닙니다."); return;
        }
        let state = game._0x004d[sender];
        let _0x0083 = isHanbang(word);
        let _0x0086 = isYudo(word);
        let _0x0085 = isRoot(word);
        let is_exception = _0x0083 || _0x0086;
        let _0x007c = game._0x0019 === -1 ? (game.players.indexOf(sender) + 1) % 2 : (game._0x0019 + 1) % 2;
        let _0x007d = game._0x004d[game.players[_0x007c]];
        if (game.history.length === 0 && is_exception) {
            replier.reply("채린룰 위반: 첫 수에는 한방단어나 유도단어를 사용할 수 없습니다."); return;
        }
        let _0x0068 = (WORD_SET && WORD_SET.has(word)) || (game._0x0067 && game._0x0067.has(word));
        if (!_0x0068 && state.job === "뜀틀선수" && word === "뜀틀") _0x0068 = true;
        if (!_0x0068) {
            if (state.job !== "해커" || state._0x004f === 0) {
                replier.reply("사전에 등록되지 않은 단어입니다."); return;
            }
        }
        if (game.used.has(word)) {
            if (state.job === "해커" && state._0x004f > 0) {
                replier.reply("조작 능력이 적용되어 중복 단어 [" + word + "] 를 재사용했습니다.");
            } else {
                replier.reply("이미 사용된 단어입니다."); return;
            }
        }
        let currentNextChar = nextCharForWord(game);
        if (game.history.length > 0) {
            if (state._0x0007) {
                let lastWord = game.history[game.history.length - 1];
                if (word[word.length - 1] !== lastWord[0]) {
                    replier.reply("환각증 여파로 이전 단어의 '첫음절'로 끝나는 앞말잇기를 해야 합니다."); return;
                }
            } else {
                if (word[0] !== game._0x006f.s1 && word[0] !== game._0x006f.s2 && word[0] !== nextw) {
                    replier.reply("'" + currentNextChar + "'(으)로 시작해야 합니다."); return;
                }
            }
        }
        if (state._0x002b > 0 && word[0] === game._0x006f.s1 && game._0x006f.s1 !== game._0x006f.s2) {
            replier.reply("디버프: 두음법칙을 사용할 수 없습니다."); return;
        }
        if (state._0x001c > 0 && _0x0083) {
            replier.reply("디버프: 한방단어를 사용할 수 없습니다."); return;
        }
        if (state._0x0046 > 0 && _0x0086) {
            replier.reply("디버프: 유도단어를 사용할 수 없습니다."); return;
        }
        if (state._0x002a > 0 && word.length % 2 !== 0) {
            replier.reply("디버프: 짝수 글자 수의 단어만 사용할 수 있습니다."); return;
        }
        if (state._0x0032 > 0 && word.length % 2 === 0) {
            replier.reply("디버프: 홀수 글자 수의 단어만 사용할 수 있습니다."); return;
        }
        if (state._0x000e > 0 && word.length !== 2) {
            replier.reply("디버프: 두 글자 단어만 사용할 수 있습니다."); return;
        }
        if (state._0x002e > 0 && word.length > state._0x002e) {
            replier.reply("디버프: " + state._0x002e + "글자 이하의 단어만 사용할 수 있습니다."); return;
        }
        if (state._0x000b > 0 && word.length >= 5) {
            replier.reply("비밀요원 타깃 포착 중: 5글자 이상의 단어를 사용할 수 없습니다."); return;
        }
        let _0x0015 = state._0x0036 > 0 || state._0x0034;
        if (state._0x003c) {
            if (word.length > 3 || is_exception) { replier.reply("삼킨 직후에는 3글자 이하 일반단어만 가능합니다."); return; }
        }
        if (_0x007d && _0x007d.job === "악당" && _0x007d._0x004a > 0) {
            let lastChosung = decomposeSyllable(word[word.length - 1]).chosung;
            if (_0x007d._0x0020.includes(lastChosung)) {
                replier.reply("악당의 결계에 가로막혔습니다! (끝음절 초성 [" + lastChosung + "] 사용 불가)"); return;
            }
        }
        if (_0x007d && _0x007d.job === "기자" && _0x007d._0x0056 > 0) {
            if (is_exception) {
                word = word.substring(0, word.length - 1) + "삐";
                state._0x0036 = Math.max(state._0x0036, 1);
                state._0x0046 = Math.max(state._0x0046, 1);
                replier.reply("기자 버프 발동: 방송 중 예외단어를 사용하여, 마지막 음절이 '삐'로 변경되었으며 1턴간 유도 및 능력 불가상태가 됩니다.");
            }
        }
        if (state.job === "마법사" && game._0x0075 <= 14 && is_exception) {
            replier.reply("마법사 패시브 [부작용]: 14턴 이전에는 한방/유도단어를 사용할 수 없습니다."); return;
        }
        if (_0x007d && _0x007d.job === "기관사" && state.job !== "기관사") {
            if (game._0x0075 % 3 === 0) {
                if (word.length > _0x007d._0x0037) {
                    replier.reply("기관사 전철역 정차 중: 종점까지 남은 역 수(" + _0x007d._0x0037 + ")보다 긴 단어를 사용할 수 없습니다."); return;
                }
            }
        }
        if (game._0x0019 === -1) {
            game._0x0019 = game.players.indexOf(sender);
            game._0x002f = game._0x0019;
        }
        let msgs = [];
        if (state.job === "뜀틀선수" && word === "뜀틀" && !_0x0015) {
            if (state._0x006a >= state._0x0079) { replier.reply("뜀틀 사용 횟수가 고갈되었습니다."); return; }
            if (state._0x0039 > 0) { replier.reply("뜀틀 쿨타임입니다."); return; }
            state._0x006a++;
            state._0x0039 = 5;
            _0x007d._0x0046 = Math.max(_0x007d._0x0046, 1);
            _0x007d._0x0036 = Math.max(_0x007d._0x0036, 1);
            msgs.push("▶ 뜀틀선수 [뜀틀] 발동! 상대방은 1턴간 유도 및 능력/패시브 불가!");
        }
        if (_0x007d && _0x007d.job === "해커" && _0x007d._0x0028 > 0) {
            if (word.length >= 4 || is_exception) {
                state._0x0034 = true;
                msgs.push("▶ 해커 [초토화] 피격! " + sender + "님의 능력이 영구 상실됩니다.");
            }
            _0x007d._0x0028 -= 1;
        }
        if (_0x007d && _0x007d.job === "투자자" && !_0x007d._0x0034 && _0x007d._0x0036 === 0) {
            let change = 0;
            if (_0x007d._0x0016) {
                change = -word.length;
                _0x007d._0x0016 = false;
                msgs.push("- 주가 조작 여파: 무조건 차감 (-" + word.length + ")");
            } else {
                change = word.length % 2 === 0 ? -word.length : word.length;
            }
            _0x007d._0x0033 += change;
            let dispStr = change > 0 ? ("상승(+" + change + ")") : ("하락(" + change + ")");
            msgs.push("▶ 투자자 패시브: 주가 " + dispStr + " [현재: " + _0x007d._0x0033 + " / 승리 목표: " + game._0x0075 + " 이내]");
            if (_0x007d._0x0033 <= game._0x0075) {
                replier.reply(msgs.join("\n"));
                replier.reply("투자자(" + game.players[_0x007c] + ")가 주가 폭락을 달성하여 게임에서 승리했습니다!");
                delete games[room]; return;
            }
        }
        if (_0x007d && _0x007d.job === "환자" && !_0x007d._0x0034 && _0x007d._0x0036 === 0) {
            if (word.length % 2 !== 0 && _0x007d._0x003e === 0) {
                _0x007d._0x003e = 3;
                state._0x002a = Math.max(state._0x002a, 1);
                state._0x0036 = Math.max(state._0x0036, 1);
                state._0x0046 = Math.max(state._0x0046, 1);
                msgs.push("▶ 환자 [강박증] 발동! 1턴간 짝수 단어 강제 및 유도, 능력 사용 불가!");
            }
        }
        if (_0x007d && _0x007d.job === "수집가" && !_0x007d._0x0034 && _0x007d._0x0036 === 0) {
            let collected = [word[0]];
            if (_0x007d._0x0059 > 0) { collected = word.split(''); _0x007d._0x0059 = 0; msgs.push("- 채굴 효과로 모든 음절 수집!"); }
            _0x007d._0x0009 = _0x007d._0x0009.concat(collected);
            msgs.push("▶ 수집가 [수집]: [" + collected.join(",") + "] 음절 휙득.");
        }
        if (state.job === "수집가" && game._0x0067 && game._0x0067.has(word)) {
            _0x007d._0x0036 = Math.max(_0x007d._0x0036, 1);
            msgs.push("▶ 수집가 [추가단어 사용]: 상대는 1턴간 능력 불가!");
            game._0x0067.delete(word);
        }
        if (_0x007d && _0x007d.job === "감시자" && !_0x007d._0x0034 && _0x007d._0x0036 === 0) {
            let deduction = 0;
            if (_0x0086) deduction += 4;
            if (_0x0083) deduction += 8;
            if (_0x0085) deduction += 2;
            let debuff_count = (_0x007d._0x0036 > 0 ? 1 : 0) + (_0x007d._0x0046 > 0 ? 1 : 0) + (_0x007d._0x001c > 0 ? 1 : 0) + (_0x007d._0x002b > 0 ? 1 : 0);
            deduction += debuff_count;
            if (_0x007d._0x000c > 0) {
                deduction *= 2;
                _0x007d._0x000c -= 1;
            }
            if (deduction > 0) {
                _0x007d._0x005f -= deduction;
                msgs.push("▶ 감시자 [감시]: 위반 행위 포착! (감시 수 -" + deduction + " 됨, 현재: " + _0x007d._0x005f + ")");
                if (_0x007d._0x005f <= 0) {
                    _0x007d._0x005f = 0;
                    msgs.push("- 감시 수 0 도달! 감시자가 무기한 룰 무시 상태가 됩니다.");
                }
            }
        }
        if (state.job === "늑대인간" && !_0x0015 && state._0x0048 === 0) {
            let count = (word.match(/[ㅇㅎ]/g) || []).length;
            if (count >= 1) {
                _0x007d._0x002a = Math.max(_0x007d._0x002a, 2);
                msgs.push("▶ 늑대인간 [포효] 발동! 상대는 2턴간 짝수 단어 제한.");
                if (count >= 3) {
                    _0x007d._0x0036 = Math.max(_0x007d._0x0036, 1);
                    msgs.push("- 추가 효과: 상대 1턴간 능력 불가.");
                }
                state._0x0048 = 2;
            }
        }
        if (state.job === "비밀요원" && !_0x0015 && state._0x0082.length === 0) {
            state._0x0082 = ["타깃1", "타깃2"];
            msgs.push("▶ 비밀요원 [타깃 확보] 발동: 타깃 단어가 설정되었습니다.");
        }
        if (_0x007d && _0x007d.job === "비밀요원" && _0x007d._0x0082.includes(word)) {
            state._0x0036 = Math.max(state._0x0036, 1);
            state._0x000b = 2;
            msgs.push("▶ 비밀요원 타깃 적중! 2턴간 포획 대상이 되며 5글자 이상 불가.");
            _0x007d._0x0082 = [];
        }
        if (state.job === "67" && !_0x0015 && state._0x0008 === 0) {
            if (word.length === 6) {
                state._0x0008 = 1;
                if (_0x007d._0x0046 > 0) _0x007d._0x0046 += 7;
                else {
                    _0x007d._0x0046 = Math.max(_0x007d._0x0046, 7);
                    _0x007d._0x001c = Math.max(_0x007d._0x001c, 1);
                }
                msgs.push("▶ 67 발동! 상대는 유도 불가 연장 및 1턴 한방 불가.");
                if (_0x007d._0x0046 >= 67) {
                    replier.reply(msgs.join("\n"));
                    replier.reply("67(" + game.players[game._0x0019] + ")가 유도 스택 67을 달성하여 즉시 승리합니다!");
                    delete games[room]; return;
                }
            }
        }
        if (state.job === "사과" && !_0x0015) {
            if (state._0x0001 === 0) {
                let _0x0070 = 0;
                let _0x007e = decomposeSyllable(word[0]);
                let _0x007a = decomposeSyllable(word[word.length - 1]);
                let checkArr = ["ㅅ","ㄱ","ㄴ","ㅁ","ㅇ"];
                if (_0x007e && checkArr.includes(_0x007e.chosung)) _0x0070++;
                if (_0x007a && checkArr.includes(_0x007a.jongsung)) _0x0070++;
                if (_0x0070 >= 2) {
                    if (state._0x000f >= 10) {
                        replier.reply("사과(" + game.players[game._0x0019] + ")의 삭와 패시브가 10턴 숙성되어 발동하면서 즉시 승리합니다!");
                        delete games[room]; return;
                    }
                    if (_0x007d._0x0010 > 0) _0x007d._0x0010 += 2;
                    else _0x007d._0x0010 = 3;
                    state._0x0001 = 2;
                    state._0x000f = 0;
                    msgs.push("▶ 사과 [삭와] 발동! 사과 디버프가 부여됩니다.");
                } else {
                    state._0x000f++;
                }
            } else {
                state._0x000f++;
            }
        }
        if (_0x007d && _0x007d.job === "마하트마간디" && !_0x007d._0x0034) {
            if (_0x0083 || _0x0086) {
                _0x007d._0x003d++;
                msgs.push("▶ 마하트마간디 [비폭력]! 스택 증가 (현재: " + _0x007d._0x003d + ")");
            }
            if (_0x007d._0x003d >= 4) {
                replier.reply(msgs.join("\n"));
                replier.reply("마하트마간디(" + game.players[_0x007c] + ")가 비폭력 스택 4를 달성하여 개발자를 협박해 즉시 승리합니다!");
                delete games[room]; return;
            }
        }
        if (state.job === "은하계전사" && !_0x0015 && state._0x0044 === 0) {
            if (word.includes("별") || word.includes("달")) {
                state._0x005a++;
                state._0x0044 = 1;
                _0x007d._0x0036 = Math.max(_0x007d._0x0036, 2);
                msgs.push("▶ 은하계전사 패시브 발동! 상대 능력 2턴 불가 및 루트 음절 허용 강제.");
                if (state._0x005a >= 3 && game._0x0075 < 16) {
                    word = word.substring(0, word.length - 1) + "벨";
                    msgs.push("- 3회 누적! 끝음절이 [벨]로 고정되었습니다.");
                    state._0x000a = true;
                } else if (game._0x0075 >= 16 && state._0x000a && state._0x005a === 4) {
                    word = word.substring(0, word.length - 1) + "볠";
                    _0x007d._0x0034 = true;
                    msgs.push("- 16턴 진입 궁극 효과 발동! [볠]로 고정되며 상대는 영구히 능력을 잃습니다.");
                }
            }
        }
        if (state.job === "사신" && !_0x0015) {
            state._0x0024 -= word.length;
            if (word.length >= 8) {
                _0x007d._0x0036 = Math.max(_0x007d._0x0036, 1);
                _0x007d._0x001c = Math.max(_0x007d._0x001c, 1);
                _0x007d._0x0046 = Math.max(_0x007d._0x0046, 1);
                msgs.push("▶ 사신 [처형식] 거행! 상대는 1턴간 능력 및 예외단어 사용 불가.");
            }
        }
        if (_0x007d && _0x007d.job === "악당" && _0x007d._0x004a > 0) {
            let additionalCount = word.length;
            let adds = ["ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
            for (let i = 0; i < additionalCount && _0x007d._0x0020.length < adds.length + 2; i++) {
                let nextIdx = _0x007d._0x0020.length - 2;
                if (nextIdx >= 0 && nextIdx < adds.length) {
                    _0x007d._0x0020.push(adds[nextIdx]);
                }
            }
        }
        if (state._0x004f > 0) state._0x004f -= 1;
        if (state._0x003a > 0) state._0x003a -= 1;
        if (state._0x0013 > 0) state._0x0013 -= 1;
        if (state._0x000d > 0) state._0x000d -= 1;
        if (state._0x003e > 0) state._0x003e -= 1;
        if (state._0x0040 > 0) state._0x0040 -= 1;
        if (state._0x0045 > 0) state._0x0045 -= 1;
        if (state._0x0023 > 0) state._0x0023 -= 1;
        if (state._0x0039 > 0) state._0x0039 -= 1;
        if (state._0x0011 > 0) state._0x0011 -= 1;
        if (state._0x0048 > 0) state._0x0048 -= 1;
        if (state._0x001a > 0) state._0x001a -= 1;
        if (state._0x0008 > 0) state._0x0008 -= 1;
        if (state._0x0001 > 0) state._0x0001 -= 1;
        if (state._0x0018 > 0) state._0x0018 -= 1;
        if (state._0x0004 > 0) state._0x0004 -= 1;
        if (state._0x001f > 0) state._0x001f -= 1;
        if (state._0x004b > 0) state._0x004b -= 1;
        if (state._0x003b > 0) state._0x003b -= 1;
        if (state._0x0043 > 0) state._0x0043 -= 1;
        if (state._0x0058 > 0) state._0x0058 -= 1;
        if (state._0x001d > 0) state._0x001d -= 1;
        if (state._0x0026 > 0) state._0x0026 -= 1;
        if (state._0x0025 > 0) state._0x0025 -= 1;
        if (state._0x001b > 0) state._0x001b -= 1;
        if (state._0x001e > 0) state._0x001e -= 1;
        if (state._0x0027 > 0) state._0x0027 -= 1;
        if (state._0x003f > 0) state._0x003f -= 1;
        if (state._0x0031 > 0) state._0x0031 -= 1;
        if (state._0x0021 > 0) state._0x0021 -= 1;
        if (state._0x0017 > 0) state._0x0017 -= 1;
        if (state._0x0044 > 0) state._0x0044 -= 1;
        if (state._0x0006 > 0) state._0x0006 -= 1;
        if (state._0x0029 > 0) state._0x0029 -= 1;
        if (state._0x0036 > 0) state._0x0036 -= 1;
        if (state._0x0046 > 0) state._0x0046 -= 1;
        if (state._0x001c > 0) state._0x001c -= 1;
        if (state._0x002b > 0) state._0x002b -= 1;
        if (state._0x002a > 0) state._0x002a -= 1;
        if (state._0x0032 > 0) state._0x0032 -= 1;
        if (state._0x000e > 0) state._0x000e -= 1;
        if (state._0x002e > 0) state._0x002e = 0;
        if (state._0x000b > 0) state._0x000b -= 1;
        if (state._0x0002 > 0) state._0x0002 -= 1;
        if (state._0x004a > 0) state._0x004a -= 1;
        if (state._0x0056 > 0) state._0x0056 -= 1;
        if (state._0x0010 > 0) state._0x0010 -= 1;
        if (state._0x003c) state._0x003c = false;
        if (state._0x005e) state._0x005e = false;
        if (state._0x0051) state._0x0051 = false;
        if (_0x007d && _0x007d.job === "마하트마간디" && state._0x0003) {
            _0x007d._0x003d++;
            msgs.push("▶ 마하트마간디 [비폭력] (스킬 사용 조건): 스택 증가 (현재: " + _0x007d._0x003d + ")");
            state._0x0003 = false;
        } else if (state._0x0003) {
            state._0x0003 = false;
        }
        game.used.add(word);
        game.history.push(word);
        let last = word[word.length - 1];
        game._0x006f.s1 = applyDuEum(last);
        game._0x006f.s2 = last;
        game._0x0019 = _0x007c;
        game._0x0055 = Date.now();
        game._0x0075 = Math.floor(game.history.length / 2) + 1;
        if (msgs.length > 0) replier.reply(msgs.join("\n"));
        replier.reply(buildStatusMsg(game));
    }
});