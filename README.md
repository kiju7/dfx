# agent-forge

**Claude Code 안에서 다중 전문 에이전트가 협업하는 엔지니어링 파이프라인.** `/forge "X 해줘"` 한 번이면 — triage 가 분류하고, 필요하면 **Tech Lead** 가 코드를 read 한 후 분해하고, frontend/backend/database/devops/daemon/ux/ai 전문 에이전트가 **병렬로** 작업하고, 4명의 QC 가 **병렬로** 검토하고, 발견된 결함은 **Ralph Loop** (findings 가 0이 될 때까지 반복) 가 자동으로 고칩니다.

> 100% 네이티브 — Claude Code 의 `Task` subagent 도구로만 동작. 외부 서버·DB·대시보드 없음. 설치 = `/plugin install` 두 줄.

---

## 동작 파이프라인

![agent-forge pipeline](docs/pipeline.svg)

**모든 단계가 같은 Claude Code 세션 안에서** `Task` 툴 호출로 실행됩니다. 같은 layer 의 작업은 한 메시지에 여러 Task 호출을 동시에 띄워 **진짜 병렬**로 돌아갑니다. Tech Lead 가 의도 모호함을 감지하면 dev 작업 전에 직접 사용자에게 informed question 을 띄우고, dev 가 Discovery 중 brief 와 코드 충돌을 발견하면 `SUGGEST_REVISION` 으로 Tech Lead 한테 돌아가 재설계됩니다.

QC 수렴 후 **Tech Lead 의 Acceptance Review** 가 한 번 더 돕니다 (v0.10+) — 원본 요청 대비 의도 충족 / 전체 일관성 / PR review-level 품질 검증. REJECT 면 fix 사이클이 한 번 더 돌고 (Ralph 수렴 패턴), `APPROVE` 가 나올 때까지 반복.

모호한 bug 제보 ("가끔 X 가 안 됨" 처럼 재현 정보 부족) 는 v0.11+ 의 **Investigation Phase** 가 처리합니다 — Tech Lead 가 코드 read 만으로 가설 형성 못 하면 dev/QC 한테 *재현 시도 task* 를 발주 (코드 변경 X). 그들의 `REPRO_REPORT` 받아 Tech Lead 가 진짜 plan 을 세움. 2 라운드 cap, 그래도 불명이면 사용자한테 정보 요청 escalate.

---

## 무엇을 할 수 있나 (예시)

| 사용자 입력 | 자동 처리 |
|---|---|
| `/forge "칸반 카드 hover 시 배경 살짝 밝게"` | triage → frontend → QC×4 → (clean) → Review APPROVE → 요약 + 사용자 보고서 |
| `/forge "사용자 프로필 페이지 만들어줘"` | triage → Tech Lead → (database + backend + frontend 병렬) → QC×4 → Ralph fix → Review → 요약 |
| `/forge "GitHub Actions CI 추가, push 마다 typecheck+build"` | triage → devops → QC×4 → Review → 요약 |
| `/forge "tasks 테이블에 priority 컬럼 + 인덱스"` | triage → database → QC×4 → Review → 요약 |
| `/forge "결제 화면에서 가끔 카드 번호 마지막 자리 잘림 — 자세한 조건은 모름"` | triage → Tech Lead → **🔬 Investigation** (dev/QC 재현 시도) → 가설 명확화 → frontend fix → QC → Review → 요약 |
| `/forge "shm 비활성화하고 remote triton 으로"` | triage → Tech Lead → 의도 모호 (toggle vs delete) → **🤔 사용자에게 informed question** → 응답에 따라 dev → QC → Review → 요약 |

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
- **목표를 한 문장**으로 — 긴 명세는 Tech Lead 가 분해해주니까 줄거리만 던지세요.
- **다중 도메인**은 한 호출로 OK — triage 가 route=lead 로 보내고 Tech Lead 가 코드 보고 쪼갭니다.
- **Tech Lead ↔ Dev 설계 대화** (v0.8+): **Tech Lead** 가 코드를 적극적으로 read 한 후 분해 — 초기 분해부터 코드 reality 반영. 의도가 진짜 모호하면 (`비활성화 vs 삭제` 같은) **Tech Lead 가 초기 분해 시점에 직접 사용자에게 informed question** 을 띄움. dev 가 Discovery 중 brief 가 코드와 안 맞다고 판단하면 `SUGGEST_REVISION` 으로 Tech Lead 한테 돌아가 brief 수정. Dev 가 직접 사용자에게 묻지 않음 — 항상 Tech Lead 경유.
- **Acceptance Review** (v0.10+): QC 통과 후 Tech Lead 가 한 번 더 최종 검토 — 원본 요청 대비 의도 충족 / 전체 일관성 / PR-review 수준 품질. APPROVE 까지 Ralph 수렴 패턴으로 반복.
- **모호한 bug 도 OK** (v0.11+): "가끔 X 가 안 됨" 처럼 재현 조건 모르겠어도 던지세요. Tech Lead 가 코드 read 만으로 가설 못 세우면 **dev/QC 가 자동 재현 시도** (Investigation Phase). 재현 결과 기반으로 plan 세워서 진행. 그래도 막히면 사용자한테 정보 요청 escalate.

### 출력 형식 (parent chat)

#### 단순 케이스 (clean 직진)

```
📁 Audit log — _workspace/20260512-153022-a3f4/
🎯 Triage — fix · route=direct · targets=frontend
📋 Plan — 1 subtasks
  · [frontend] globals.css hover 변경
✅ Layer 0 — 1/1 done · escalations: none
🔍 QC — total 0 findings
🔎 Review — APPROVE · intent_match=yes
🏁 agent-forge done
요청: 칸반 카드 hover 시 배경 살짝 밝게
서브태스크: 1/1
Ralph QC: 0 iters · clean=yes · stuck=0
Acceptance Review: 1 round · verdict=APPROVE
변경 파일: 1
📁 Audit log: _workspace/20260512-153022-a3f4/

---

📄 사용자 보고서 (`_workspace/.../97-user-report.md`)

# 작업 요약
칸반 카드에 마우스 hover 시 배경이 살짝 밝아지도록 추가.
...
```

#### 모호한 bug 케이스 (Investigation 활성)

```
📁 Audit log — _workspace/20260512-160055-b21c/
🎯 Triage — bug · route=lead · targets=[lead]
🔬 Investigation — 재현 시도 (가설: input maxLength 또는 응답 truncation)
🔬 Investigation round 1 — 3 repro tasks 병렬
🔬 Investigation result — 재현 1 / 안됨 2
📋 Plan — 1 subtasks  (qc-edgecase 가 19자리 BIN 에서 재현 성공)
  · [frontend] AMEX 19자리 카드 입력 width 대응
✅ Layer 0 — 1/1 done
🔍 QC — total 0 findings
🔎 Review — APPROVE · intent_match=yes
🏁 agent-forge done
...
```

#### 의도 모호 케이스 (사용자 확인 필요)

```
🎯 Triage — feature · route=lead
📋 Tech Lead 분석 중... (코드 read)

🤔 확인 필요 [Tech Lead 초기 분해]
코드 분석: EnableShm bool 로 토글, 2 군데서 분기...
  A. EnableShm=false 로 토글 (코드 유지)
  B. SHM 관련 코드 자체 제거
추천: A. 어떻게 갈까?

[사용자: A]

📋 Plan — 1 subtasks
  · [daemon] EnableShm 기본값 false 로 변경
...
```

subagent 내부 로그는 **parent chat 에 새지 않습니다** — Task subagent 격리 덕분.

### 📁 Audit log (v0.9+)

매 /forge 호출은 `_workspace/<run-id>/` 에 단계별 audit log 를 남깁니다:

```
_workspace/20260511-153022-a3f4/
  00-request.md          # 원본 요청
  01-triage.json         # triage 출력
  02-plan.json           # Tech Lead 분해 결과
  03-impl/layer-0/
    frontend-1.md        # dev 의 brief + WORK_SUMMARY + 결과
    backend-1.md
  02b-investigation/     # (조건부, v0.11+) 모호 bug repro 활성 시
    round-1/
      backend-1.md       # REPRO_REPORT
      qc-edgecase-1.md
  04-qc/iter-0.json      # QC findings (초기)
  04-qc/iter-1.json      # QC findings (Ralph iter 1 후)
  05-ralph/iter-1.md     # Ralph 사이클 1 의 dispatch + 결과
  06-review/round-1.json # Tech Lead Acceptance Review verdict + directives
  97-user-report.md      # 비전문가용 markdown 보고서 (Tech Lead 작성)
  99-summary.md          # 최종 consolidated (기술 요약)
```

용도:
- **Audit / review** — 팀 리뷰 시 "이 commit 이 어떻게 나왔는지" 추적
- **Debug** — /forge 결과가 이상하면 단계별 입출력 확인
- **챗 context 휘발 후 회수** — chat compaction 돼도 디스크엔 남음

`.gitignore` 가 `_workspace/` 무시. 디스크 사용 미미 (run 당 ~수십 KB).

---

## 비용 가이드

`/forge` 한 번이 spawn 하는 subagent 들의 토큰 합계가 비용입니다 (모든 호출이 같은 Claude Code 세션의 API 키로 청구됨).

| 작업 규모 | 모델 분포 | 1 회 비용 추정 |
|---|---|---|
| 단순 fix (한 파일) | Triage(Haiku) + dev(Opus) + QC×4(Sonnet) + Review(Opus) | $0.50–2.00 |
| 일반 기능 / 버그 | + Tech Lead(Opus, 코드 read 포함) + Ralph 1~2 iter | $2–10 |
| 다중 도메인 신규 기능 | dev 여러 개 병렬(Opus) + QC×4 + Ralph 2~5 iter + Review | $8–35 |
| **모호한 bug (Investigation 활성)** | + Investigation 1~2 라운드 (dev/QC 재현 시도) | 위 + $1–5 |

기본 티어: triage = haiku (분류), QC×4 = sonnet (바운디드 diff 리뷰), Tech Lead + 7 devs = opus (실제 추론·편집).

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
    ├── lead.md
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
