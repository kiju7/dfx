# agent-forge

**Claude Code 안에서 다중 전문 에이전트가 협업하는 엔지니어링 파이프라인.** `/forge "X 해줘"` 한 번이면 — triage 가 분류하고, 필요하면 PM 이 분해하고, frontend/backend/database/devops/daemon/ux/ai 전문 에이전트가 **병렬로** 작업하고, 4명의 QC 가 **병렬로** 검토하고, 발견된 결함은 **Ralph Loop** (findings 가 0이 될 때까지 반복) 가 자동으로 고칩니다.

> 100% 네이티브 — Claude Code 의 `Task` subagent 도구로만 동작. 외부 서버·DB·대시보드 없음. 설치 = `/plugin install` 두 줄.

---

## 동작 파이프라인

```
사용자 요청
   │
   ▼
🧭 Triage  (Haiku · 어디로 보낼지)
   │
   ├─ direct ─────────────────┐
   │                          │
   └─ pm → 📋 PM (sub-task 분해, 의존성) ──┐
                                          │
                                          ▼
                            ⚒️  병렬 dev subagents
                            ┌────┬────┬────┬────┬────┬────┬────┐
                            │ FE │ BE │ DB │ DO │ DA │ UX │ AI │
                            └────┴────┴────┴────┴────┴────┴────┘
                                          │
                                          ▼
                            🔍 4× QC 병렬 검토
                            ┌──────────┬──────────┬──────┬──────┐
                            │ edgecase │ security │ perf │  ux  │
                            └──────────┴──────────┴──────┴──────┘
                                          │
                            findings 있으면 ↻ Ralph Loop
                            (clean 될 때까지 무한 반복 ·
                             같은 finding 2회 미해결 = STUCK
                             모두 STUCK 이면 escalate)
                                          │
                                          ▼
                                   🏁 consolidated summary
```

**모든 단계가 같은 Claude Code 세션 안에서** `Task` 툴 호출로 실행됩니다. 같은 layer 의 작업은 한 메시지에 여러 Task 호출을 동시에 띄워 **진짜 병렬**로 돌아갑니다.

---

## 무엇을 할 수 있나 (예시)

| 사용자 입력 | 자동 처리 |
|---|---|
| `/forge "칸반 카드 hover 시 배경 살짝 밝게"` | triage → frontend → QC×4 → (clean) → 요약 |
| `/forge "사용자 프로필 페이지 만들어줘"` | triage → pm → (database + backend + frontend 병렬) → QC×4 → fix → 요약 |
| `/forge "GitHub Actions CI 추가, push 마다 typecheck+build"` | triage → devops → QC×4 → 요약 |
| `/forge "tasks 테이블에 priority 컬럼 + 인덱스"` | triage → database → QC×4 → 요약 |

---

## 설치

**사전 요구사항**: Claude Code 2.0+ ([docs.claude.com/claude-code](https://docs.claude.com/claude-code)). 그 외 의존성 없음 — 외부 데몬·DB·Node 런타임 모두 불필요.

### 한 번에 설치 (Claude Code 안에서 두 줄)

```
/plugin marketplace add kiju7/agent-forge
/plugin install agent-forge@kiju7-agent-forge
```

또는 GUI 로: `/plugin` → **Discover** 탭 → `agent-forge` 선택 → Install.

설치 위치 (스코프) 선택지:
- **user** (기본·권장) — `~/.claude/plugins/` 어느 프로젝트에서든 `/forge` 가능
- **project** — `.claude/settings.json` 에 박혀 팀과 공유
- **local** — 본인만, 이 프로젝트에서만

### 업데이트 / 제거

```
/plugin marketplace update kiju7-agent-forge   # 새 버전 동기화
/plugin uninstall agent-forge                  # 제거
```

### 동작 확인

```
$ claude
> /forge "현재 디렉토리 구조 한 줄로 요약해줘"
```

`🎯 Triage → ... → 🏁 done` 식의 출력이 한두 줄씩 떨어지면 성공.

### (선택) 수동 설치 — 마켓플레이스 통하지 않고 직접 복사

```bash
git clone https://github.com/kiju7/agent-forge.git /tmp/agent-forge
mkdir -p ~/.claude/commands ~/.claude/agents ~/.claude/skills
cp    /tmp/agent-forge/commands/forge.md ~/.claude/commands/
cp -r /tmp/agent-forge/agents/*          ~/.claude/agents/
cp -r /tmp/agent-forge/skills/forge      ~/.claude/skills/
rm -rf /tmp/agent-forge
```

내부망·오프라인 환경에서 유용해요.

---

## 사용법

```
/forge "<your engineering request>"
```

### 어떻게 부르면 잘 동작하나

- **명확한 도메인 단어**를 1~2개 포함 → triage 정확도 ↑
  - 좋음: `"globals.css 에 hover 효과 추가"`, `"tasks 테이블 priority 컬럼 추가"`
  - 약함: `"좀 더 예쁘게"`, `"성능 좋게"`
- **목표를 한 문장**으로 — 긴 명세는 PM 이 분해해주니까 줄거리만 던지세요.
- **다중 도메인**은 한 호출로 OK — triage 가 route=pm 으로 보내고 PM 이 알아서 쪼갭니다.
- **PM ↔ Dev 설계 대화 + ASK_USER** (v0.7.0+): dev 가 Discovery 후 brief 가 코드 현실과 맞지 않다고 판단하면 `SUGGEST_REVISION` 으로 PM 한테 돌아가 brief 를 수정합니다. 의도가 진짜 모호하면 (`비활성화 vs 삭제` 같은) `ASK_USER` 로 사용자에게 informed question 을 던집니다. 답해주면 그 결정으로 진행.

### 출력 형식 (parent chat)

```
🎯 Triage — fix · route=direct · targets=frontend
📋 Plan — 1 subtasks
  · [frontend] globals.css hover 변경
✅ Layer 0 — 1/1 done · escalations: none
🔍 QC — total 0 findings
🏁 agent-forge done

요청: 칸반 카드 hover 시 배경 살짝 밝게
서브태스크: 1/1
QC 통과: yes  잔여 findings: 0
변경 파일: 1

다음 단계 권고:
  · 변경 확인 후 commit
```

subagent 내부 로그는 **parent chat 에 새지 않습니다** — Task subagent 격리 덕분.

---

## 비용 가이드

`/forge` 한 번이 spawn 하는 subagent 들의 토큰 합계가 비용입니다 (모든 호출이 같은 Claude Code 세션의 API 키로 청구됨).

| 작업 규모 | 모델 분포 | 1 회 비용 추정 |
|---|---|---|
| 단순 fix (한 파일) | Triage(Haiku) + dev(Opus) + QC×4(Sonnet) | $0.40–1.50 |
| 일반 기능 / 버그 | + PM(Opus) + Ralph 1~2 iter | $2–8 |
| 다중 도메인 신규 기능 | dev 여러 개 병렬(Opus) + QC×4 + Ralph 2~5 iter | $8–30 |

기본 티어: triage = haiku (분류), QC×4 = sonnet (바운디드 diff 리뷰), pm + 7 devs = opus (실제 추론·편집).

비용 제어:
- 비싸다 싶으면 `agents/<dev>.md` 의 `model: opus` → `sonnet` 로 다운그레이드 (품질 vs 비용 트레이드).
- QC 4개를 줄이고 싶으면 `skills/forge/SKILL.md` 의 "Step 4" 에서 일부 제외.

---

## 디렉토리 구조

```
agent-forge/
├── .claude-plugin/
│   ├── plugin.json              # 플러그인 매니페스트
│   └── marketplace.json         # 마켓플레이스 엔트리 (/plugin install 가능하게)
├── commands/
│   └── forge.md                 # /forge 슬래시 커맨드
├── skills/
│   └── forge/SKILL.md           # 파이프라인 오케스트레이션 로직
└── agents/                      # 13개 네이티브 subagent
    ├── triage.md
    ├── pm.md
    ├── frontend.md
    ├── backend.md
    ├── database.md
    ├── devops.md
    ├── daemon.md
    ├── ux.md
    ├── ai.md
    ├── qc-edgecase.md
    ├── qc-security.md
    ├── qc-perf.md
    └── qc-ux.md
```

⚠ Claude Code 플러그인은 **플러그인 루트** 의 `commands/`, `agents/`, `skills/` 를 자동 발견. `.claude/` 안에 넣으면 안 잡힘.

---

## 커스터마이즈

### 새 전문 에이전트 추가

```bash
# agents/security-auditor.md
---
name: security-auditor
description: 보안 감사 전문 — 코드 변경 외에 의존성 / .env / 비밀 노출까지 본다
model: sonnet
tools: [Read, Grep, Glob, Bash]
---
당신의 역할은...
```

추가 후 `skills/forge/SKILL.md` 의 라우팅 표에 카테고리 매핑만 추가하면 끝.

### QC 빼기 / 추가

`skills/forge/SKILL.md` 의 **Step 4** 에서 4개 중 일부를 제외하거나 새 QC 를 추가하세요.

### 모델 다운/업그레이드

각 `agents/<name>.md` 의 `model:` 필드. 옵션: `haiku | sonnet | opus`.

---

## 동작 원리 (간단히)

1. `/forge` 슬래시 커맨드 = `commands/forge.md` → 본문에 `forge` skill 호출을 지시
2. Claude Code 가 `skills/forge/SKILL.md` 를 시스템 프롬프트에 합쳐서 본 어시스턴트가 오케스트레이터 역할을 함
3. 본 어시스턴트가 `Task(subagent_type: "triage", ...)` 같은 호출로 13개의 subagent 정의 (`agents/*.md`) 를 가져다 격리된 컨텍스트에서 실행
4. 같은 메시지에 여러 Task 호출 = 병렬 / 다음 메시지의 Task 호출 = 순차

Claude Code 의 [Task subagent 기능](https://docs.claude.com/en/docs/claude-code/sub-agents) 를 그대로 쓰는 거라서 추가 인프라가 0 입니다.

---

## 추가 정보

- **레포**: <https://github.com/kiju7/agent-forge>
- **레퍼런스 (동일 컨셉)**: <https://github.com/revfactory/harness>
- **이슈/제안**: GitHub 레포에 이슈 등록
