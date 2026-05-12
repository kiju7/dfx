---
name: dfx
description: Multi-agent engineering pipeline that runs entirely inside Claude Code. Triages a user request, breaks it down via Tech Lead if needed, dispatches specialist devs in parallel, runs QC reviewers, and feeds findings back as fix tasks — all via Task-tool subagents.
---

# dfx — dfx 네이티브 파이프라인

당신은 **dfx 오케스트레이터** 입니다. 사용자가 엔지니어링 요청을 줬으니 아래 파이프라인을 `Task` 툴 + 적절한 `subagent_type` 으로 실행하세요. 외부 서비스·대시보드·DB 없이 모든 것이 이 Claude Code 세션 안의 subagent 격리로 돌아갑니다.

사용자 요청은 슬래시 커맨드가 넘긴 `$ARGUMENTS` 값 (또는 본인을 호출한 주변 대화 메시지) 에 있습니다.

---

## 사전 준비: `_workspace/` audit log

파이프라인 시작 전, audit log 디렉토리를 만든다 (Bash 1회):

```bash
RUN_ID="$(date +%Y%m%d-%H%M%S)-$(printf '%04x' $((RANDOM % 65536)))"
mkdir -p "_workspace/${RUN_ID}/03-impl" "_workspace/${RUN_ID}/04-qc" "_workspace/${RUN_ID}/05-ralph"
# 원본 사용자 요청 저장
cat > "_workspace/${RUN_ID}/00-request.md" <<'EOF'
<원본 user 요청 원문>
EOF
echo "${RUN_ID}" > "/tmp/dfx-current-run-id"
```

부모 chat 에 한 줄:
> 📁 **Audit log** — `_workspace/<RUN_ID>/`

이후 단계마다 `_workspace/${RUN_ID}/` 아래에 파일 append. 구조:

```
_workspace/<run-id>/
  00-request.md          # 원본 요청
  01-triage.json         # triage 출력 (raw JSON)
  02-plan.json           # Tech Lead 출력 (or branches if needs_user)
  03-impl/
    layer-0/
      <role>-<idx>.md    # brief + WORK_SUMMARY + 상태
  04-qc/
    iter-0.json          # 초기 QC findings
    iter-N.json          # Ralph iter N 의 QC
  05-ralph/
    iter-1.md            # finding 매핑 + dispatch + 결과
  02b-investigation/     # (조건부) bug repro 흐름 활성화 시
    round-1/
      backend-1.md       # REPRO_REPORT
      qc-edgecase-1.md
    round-2/
  06-review/
    round-1.json         # Acceptance Review verdict + fix_directives
    round-N.json
  97-user-report.md      # Tech Lead 가 쓴 비전문가용 보고서 (APPROVE 시)
  99-summary.md          # 최종 consolidated (기술 요약)
```

`.gitignore` 가 `_workspace/` 추적 안 함. 디스크 사용 미미 (run 당 ~수십 KB).

---

## 파이프라인

### 1. Triage (항상)

`Task(subagent_type: "triage")` 를 사용자 요청 원문으로 spawn. JSON 반환:

```json
{ "kind": "...", "route": "lead"|"direct", "targets": [...], "confidence": 0.x, "reasoning": "..." }
```

파싱 후 한 줄 상태 출력:

> 🎯 **Triage** — `<kind>` · route=`<route>` · targets=`<targets>`

raw JSON 을 `_workspace/${RUN_ID}/01-triage.json` 에 저장.

### 2. Plan — Tech Lead (route == "lead" 인 경우)

`route == "lead"` 이면 `Task(subagent_type: "lead")` spawn.

**Tech Lead 는 코드를 적극적으로 read 한 후 분해**. 두 응답 중 하나 반환:

**(a) 분해 완료**:

```json
{ "summary": "...", "subtasks": [ { "title": "...", "targets": ["frontend"], "brief": "...", "depends_on": [] } ] }
```

**(b) 사용자 확인 필요** (코드 read 후에도 의도 모호):

```json
{
  "needs_user": true,
  "question": { "observed": "...", "ambiguity": "...", "options": [...], "recommendation": "A" },
  "branches": {
    "A": { "summary": "...", "subtasks": [...] },
    "B": { "summary": "...", "subtasks": [...] }
  },
  "reasoning": "..."
}
```

(b) 인 경우 orchestrator 처리:
1. 부모 chat 에 표시:

   > 🤔 **확인 필요** [Tech Lead 초기 분해]
   >
   > 코드 분석: `<observed>`
   > 모호함: `<ambiguity>`
   >
   >   A. `<option A>` — `<scope>`
   >   B. `<option B>` — `<scope>`
   >
   > 추천: `<recommendation>`. 어떻게 갈까?

2. 사용자 응답 받음 → `branches[answer]` 의 subtasks 로 진행

**(c) 검증 방식 확인 필요** (Mode 6 — Tech Lead 가 응답에 `verification_choice` 필드 포함했을 때, 위 (a) 또는 (b) 와 결합 가능):

조건: 변경이 *관찰 가능한 동작* + *둘 이상의 합리적 검증 방식* + *선택이 의미있게 다름*.

orchestrator 처리:
1. 부모 chat 에 표시:

   > 🧪 **검증 방식 선택** [Tech Lead Mode 6]
   >
   > `<context>`
   >
   >   A. `<approach A>` — `<cost>` / `<fitness>`
   >   B. `<approach B>` — `<cost>` / `<fitness>`
   >   C. ...
   >
   > 추천: `<recommendation>`. 어떻게 갈까?

2. 사용자 응답 받음
3. `branches[answer]` 의 subtasks 를 최종 plan 으로 사용 → Step 3 (Implement) 진행

상태 라인 (대기 중):
> 🧪 **Verification choice** — awaiting user

검증 선택 후 한 줄:
> 🧪 **Verification** — `<선택>` (`<approach>`)

`route == "direct"` 면 sub-task 1개 합성:
```json
[{ "title": "<짧게>", "targets": triage.targets, "brief": <원본 요청>, "depends_on": [] }]
```

출력:

> 📋 **Plan** — `<N>` subtasks

sub-task 마다 한 줄: `  · [<role>] <title>`.

Tech Lead 의 raw JSON 응답 (분해 결과 OR branches) 을 `_workspace/${RUN_ID}/02-plan.json` 에 저장.

### 2.5. Investigation Phase (Tech Lead Mode 5b — 조건부, kind=bug + 재현 불명 시)

Tech Lead 가 `investigation: true` 응답 반환하면 (정상 plan 대신):

1. 부모 chat 출력:
   > 🔬 **Investigation** — 재현 시도 (가설: `<hypothesis 한 줄>`)

2. `subtasks` 들 (모두 `kind: "repro"`) 병렬 spawn:
   - 각 task 의 prompt 에 brief + `kind: "repro"` 명시
   - dev / QC 는 코드 변경 없이 재현만 시도 (자세한 동작은 각 agent .md 의 `Repro 모드` 섹션)
   - 각자 `REPRO_REPORT` 반환 (`TASK_DONE`/`WORK_SUMMARY` 대신)

3. 모든 REPRO_REPORT 수집 → `_workspace/${RUN_ID}/02b-investigation/round-<n>/<role>-<idx>.md` 저장

4. Tech Lead 재호출 (Mode 5c) — context 에 모든 REPRO_REPORT 첨부:
   - **Mode 1** (가설 명확, normal plan) → Step 3 (Implement) 진행
   - **Mode 5b** (또 investigation 필요) → 이 step 다시 (단 2 라운드 cap)
   - **Mode 2** (사용자 escalate, 재현 정보 더 필요) → 3b 처리

상태 라인:
> 🔬 **Investigation round `<n>`** — `<N>` repro tasks 병렬

라운드 종료:
> 🔬 **Investigation result** — 재현 `<x>` / 안됨 `<y>` / 부분 `<z>`

**라운드 제한**: 2 라운드 cap. 3 라운드 시도 시 Tech Lead 가 자동 Mode 2 로 전환 (사용자 escalate).

### 3. Implement (병렬)

sub-task 를 의존성 layer 로 묶음:
- Layer 0 = `depends_on: []` 인 sub-task
- Layer 1 = deps 가 모두 layer 0 에 있는 sub-task
- ... 이런 식

**같은 layer 안에서는 한 어시스턴트 메시지에 `Task` 호출 N개를 동시에 띄워 병렬 실행**. 각 Task 의 `subagent_type` = sub-task 의 첫 번째 target role (`frontend | backend | database | devops | daemon | ai | ux`). brief 를 프롬프트로 넘기고, 원본 사용자 요청도 컨텍스트로 함께 전달.

**Same-role 직렬화** (강제 룰, 예외 없음)

한 layer 안에 동일 role sub-task 가 2개 이상이면 그것들끼리는 **직렬 spawn** (한 메시지에 1 Task → `TASK_DONE` 받고 → 다음 메시지에 다음 Task). 다른 role 끼리는 같은 메시지에서 그대로 병렬.

**Tech Lead 가 "parallel-safe" / "병렬 안전" 으로 판단하거나 `scope_files` 가 disjoint 라고 명시해도 이 룰 무시 금지.** 파일 경로 disjoint 만으로는 안전 보장 안 됨:
- 같은 git working tree 공유 → git index / staging 상태 충돌
- 빌드 artifact (`target/`, `dist/`, `node_modules/`) 공유
- cross-package symbol resolution — 한 agent 의 미완 코드가 다른 agent 의 `mvn test` / `tsc` / `pytest` 컴파일 깨뜨림
- pom.xml / package.json / Cargo.toml 등 shared config
- import 그래프상 간접 의존

실제 사례 (회귀 방지): 6 개 포맷 핸들러 (pptx/doc/xls/ppt/hwpx/hwp) 가 디렉토리 disjoint 라 Tech Lead 가 병렬 OK 판단 → 실제로는 cross-package test 실패 + 일부 변경 lost-update 로 `.diff` 백업 후 수동 복구. 직렬화 룰이 막아야 했던 케이스.

**누적 WORK_SUMMARY 전달** (직렬화의 부가 이득): n 번째 dev 의 prompt 에 1 ~ n-1 번째 같은 role 의 모든 WORK_SUMMARY 포함. 지시 추가: "기존 형제 sub-task 들이 따른 패턴 (naming · 구조 · assumption · 공통 helper) 을 그대로 유지할 것. 새로 짜지 말고 형제 패턴 재사용."

→ 비슷한 N 개 작업 (예: format handler N 개, CRUD 화면 N 개) 에서 첫 sub-task 가 reference implementation 이 되고 나머지가 그 패턴을 따라감. 일관성 확보.

각 dev subagent 는 **3가지 중 하나** 반환:

| 반환 | 의미 |
|---|---|
| `WORK_SUMMARY:` + `TASK_DONE` | 정상 완료 |
| `ESCALATE: <이유>` | 진행 불가 |
| `SUGGEST_REVISION:` 블록 | brief 와 코드 현실 충돌 또는 동사 모호 → **Tech Lead 한테 돌아가 재설계** (3a) |

`WORK_SUMMARY` 는 role 별로 보관 — step 5 의 fix Task spawn 때 후임 에이전트한테 전임자 컨텍스트로 끼움.

**Dev 는 사용자에게 직접 묻지 않음.** 모든 모호함·충돌은 Tech Lead 으로 돌아감. Tech Lead 이 코드 추가 확인 후 결정하거나, 그래도 모호하면 Tech Lead 이 사용자에게 informed question 을 띄움.

#### 3a. `SUGGEST_REVISION` 처리 (Dev → Tech Lead → 결정 or User → Dev 재spawn)

dev 반환 형태:

    SUGGEST_REVISION:
      observed:         "코드에서 발견한 사실"
      conflict:         "brief 의 어떤 가정이 깨졌는지"
      interpretations:  # 동사 해석이 둘 이상 합리적일 때만 (선택)
        - { label: "A", description: "...", scope: "..." }
        - { label: "B", description: "...", scope: "..." }
      recommendation:   "A"   # dev 의 의견 (선택)
      proposal:         "Tech Lead 한테 던지는 권장 수정안"

orchestrator:
1. `Task(subagent_type: "lead")` 재호출 (revision mode) — prompt 에 원본 user 요청 + 이전 sub-task brief + dev 의 SUGGEST_REVISION 전체
2. Tech Lead 이 **두 가지 응답** 중 하나 반환:

   **(a) Decide — brief 수정해서 진행**:
   ```json
   { "revision": true, "subtask": { 수정된 brief }, "reasoning": "..." }
   ```
   → 수정된 brief 로 dev 재spawn.

   **(b) Escalate — 사용자 확인 필요**:
   ```json
   {
     "revision": true,
     "needs_user": true,
     "question": {
       "observed": "...", "ambiguity": "...",
       "options": [
         { "label": "A", "description": "...", "scope": "..." },
         { "label": "B", "description": "...", "scope": "..." }
       ],
       "recommendation": "A"
     },
     "branches": {
       "A": { "title": "...", "targets": [...], "brief": "A 선택 시 brief", "depends_on": [] },
       "B": { "title": "...", "targets": [...], "brief": "B 선택 시 brief", "depends_on": [] }
     },
     "reasoning": "..."
   }
   ```
   → 3b 처리로 분기.

상태 라인:
> 🔄 **Revise** [`<role>` · `<sub-task title>`] — round `<n>`

**라운드 제한**: revision 라운드 **최대 2회**. 3회째도 미해결이면 자동 escalate-to-user 강제.

#### 3b. Tech Lead 의 사용자 escalation 처리

Tech Lead 이 `needs_user: true` 반환한 경우 orchestrator:

1. 부모 chat 에 표시:

   > 🤔 **확인 필요** [`<role>` · `<sub-task title>`]
   >
   > 코드 분석: `<observed>`
   > 모호함: `<ambiguity>`
   >
   >   A. `<option A label>` — `<scope>`
   >   B. `<option B label>` — `<scope>`
   >
   > 추천: `<recommendation>`. 어떻게 갈까?

2. 사용자 응답 (다음 user message) 받음
3. 응답 매칭:
   - "A" / "B" 라벨로 응답 → `branches[label]` 를 brief 로 사용 → dev 재spawn
   - 다른 답 (예: "C 안 만들어줘") → Tech Lead 재호출 (응답을 context 에 박아서) → Tech Lead 이 새 revised brief 반환

상태 라인 (대기 중):
> 🤔 **Ask** [`<role>` · `<sub-task title>`] — awaiting user input

layer 끝나면 한 줄:

> ✅ **Layer `<n>`** — `<done>/<total>` done · escalations: `<목록 또는 none>`

각 dev 의 반환 (`WORK_SUMMARY` + `TASK_DONE` 또는 `ESCALATE` 또는 `SUGGEST_REVISION`) 을 `_workspace/${RUN_ID}/03-impl/layer-<n>/<role>-<idx>.md` 에 저장. brief, dev 반환, 처리 결과 포함.

subagent 가 ESCALATE 해도 **파이프라인 중단 금지**. 해당 sub-task 만 escalated 마킹하고, 그것에 의존하지 않는 layer 는 계속 진행. 최종 요약에서 escalation 들 노출.

### 4. QC 리뷰 (병렬 · 4명)

모든 구현 layer 가 끝나면 **4명의 QC 리뷰어를 한 메시지에서 병렬 spawn** (Task 호출 4개):
- `qc-edgecase`, `qc-security`, `qc-perf`, `qc-ux`

각 QC Task 의 prompt 에 **반드시 다음 context 포함** (false positive 방지):
- 원본 user 요청 (의도)
- 누적 dev WORK_SUMMARY (모든 sub-task — files_touched / key_decisions / assumptions / not_done)
- 지시: "git diff HEAD 로 변경 확인. 의도(요청 + WORK_SUMMARY) 관점에서 finding 판단. 의도적으로 결정된 사항은 잡지 말 것. **Phase 2 (동적 검증) mandatory — finding 후보를 실제로 재현·측정·렌더 시도 후 재현된 것만 report. Docker dev 컨테이너 (bind mount + `docker exec`) 우선 활용해 rebuild 비용 0 으로 처리.**"

각각 `{ "findings": [...] }` 반환. 전 findings 합치고 severity 별 집계.

출력:

> 🔍 **QC** — total `<N>` findings (blocker `<a>` · critical `<b>` · major `<c>` · minor `<d>` · nit `<e>`)

전 findings 합본을 `_workspace/${RUN_ID}/04-qc/iter-<n>.json` 에 저장 (`<n>` = Ralph iter 카운터, 초기 = `0`).

### 5. Ralph Loop (수렴할 때까지)

본격 Ralph Loop — `nit` 이 아닌 finding 이 **0이 될 때까지** 반복. 외부 카운터 없이 상태로만 수렴 판정.

**한 사이클**:

a. **Route by category** — 각 non-`nit` finding 을 담당 role 로 매핑:
   - `ui | a11y | layout | ux` → `frontend` (순수 디자인은 `ux`)
   - `api | worker | queue | cron | agent | prompt | tool` → `backend` / `daemon` / `ai`
   - `db` → `database`
   - `auth | security` → `backend`
   - `perf` → finding 의 파일 경로로 추론
   - 그 외 → `backend`

b. **Group by role**. role 마다 Task 1개씩 **병렬 spawn** (한 메시지에 N Task). 프롬프트에 다음을 모두 포함:
   - 원본 user 요청 (한 줄)
   - 해당 role 이 직전에 반환한 **WORK_SUMMARY** (있으면 — 전임의 files_touched / key_decisions / assumptions / not_done)
   - 이번 iter 가 다룰 finding 목록
   - 지시: "편집 전에 `git diff HEAD` 로 현재 코드 상태 확인. **diff 가 ground truth — summary 와 다르면 diff 를 신뢰.** 각 finding 을 고친 뒤 `WORK_SUMMARY` + `TASK_DONE` 반환."

   **Fix dev 도 동일 3-type 반환 contract 적용** — `WORK_SUMMARY+TASK_DONE` / `ESCALATE` / `SUGGEST_REVISION`. SUGGEST_REVISION 발동 시 step 3a 와 동일 처리 (Tech Lead 재호출 → 결정 또는 needs_user escalation). Dev 가 사용자에게 직접 묻지 않음 — 항상 Tech Lead 경유.

c. **모든 dev Task 가 끝나면 step 4 (QC 4종 병렬) 재실행**.

d. **종료 조건** (Ralph — 상태로만 판정, 외부 카운터 없음):
   - non-`nit` findings 가 0 → ✅ 수렴 성공, 루프 종료
   - 같은 finding (제목 또는 파일+카테고리) 이 **2회 연속 미해결** → 그 finding 을 `STUCK` 으로 마킹하고 다음 iter 의 fix 대상에서 제외 (다른 finding 들은 계속 처리)
   - 모든 잔여 finding 이 `STUCK` 으로 마킹됨 → ⚠ 수렴 실패, 루프 종료 (최종 요약에서 escalation 으로 보고)

e. **사이클마다 한 줄 출력**:

   > 🔧 **Ralph iter `<i>`** — `<N>` findings → `<M>` roles · prev stuck=`<K>`

   사이클 종료 후:

   > 🔁 **iter `<i>` result** — fixed `<x>`, new `<y>`, stuck `<z>`, remaining `<r>`

f. **사이클 결과 저장** — `_workspace/${RUN_ID}/05-ralph/iter-<i>.md` 에 다음 모두 기록:
   - finding 의 role-매핑 결정
   - 각 role 의 dev dispatch 결과 (WORK_SUMMARY)
   - iter 결과 통계 (fixed / new / stuck / remaining)
   - 새 QC findings 는 `04-qc/iter-<i>.json` 에 별도 저장 (위 step 4 와 동일 경로 규약).

**중요**: QC 가 새 finding 을 발견할 수 있음. 매 iter 의 QC 결과는 누적이 아닌 그 시점 코드 기준 — `STUCK` 마킹은 "같은 제목+카테고리의 finding 이 다시 떴는가" 로 판정.

루프 끝난 뒤 한 줄:

> 🏁 **Ralph done** — `<iter 수>` iters · fixed `<누적>` · stuck `<수>` · clean=`<yes/no>`

### 6. Acceptance Review (Tech Lead — Ralph 수렴 패턴)

Step 5 Ralph QC 가 clean 으로 수렴한 뒤, Tech Lead 한테 **최종 acceptance review** 맡김. QC 가 못 잡는 영역 (의도 충족·일관성·품질) 검증.

`Task(subagent_type: "lead")` (review mode = 모드 4) spawn. prompt 에 다음 포함:
- 원본 user 요청
- 초기 plan
- 누적 dev WORK_SUMMARY
- 최종 `git diff HEAD`
- (있으면) 직전 review round 의 fix_directives + 처리 결과

세 verdict 중 하나 반환 (자세한 형식은 `agents/lead.md` 모드 4):

| verdict | 처리 |
|---|---|
| `APPROVE` | `user_report_md` 필드를 추출해 `_workspace/${RUN_ID}/97-user-report.md` 에 저장. Step 7 로 진행 |
| `REJECT` | `fix_directives` 를 finding 형태로 변환 → Step 5 (Ralph QC) 한 번 더 → 통과 시 Step 6 재실행 |
| `NEEDS_USER` | 사용자에게 informed question (3b 와 동일 처리) → 응답 → `branches[answer].fix_directives` 적용 |

상태 라인 (review 시작):
> 🔎 **Review** — Tech Lead 검토 중...

review 결과:
> 🔎 **Review** — `<verdict>` · intent_match=`<yes/no>` · `<reasoning 한 줄>`

**Ralph 수렴 (Review 사이클)** — 외부 카운터 없음, 상태로만 판정:
- `APPROVE` 도달 → 수렴 성공, Step 7
- 같은 핵심 `fix_directive` 가 **2회 연속 미해결** → 그 directive 를 `STUCK` 으로 마킹 (다른 directives 는 계속 처리)
- 모든 잔여 directive 가 STUCK → ⚠ Review 수렴 실패, 자동 NEEDS_USER 로 escalate

각 review round 의 응답 (verdict + fix_directives + intent_match) 을 `_workspace/${RUN_ID}/06-review/round-<n>.json` 에 저장.

루프 끝난 뒤:
> 🏁 **Review done** — `<round 수>` rounds · verdict=`<final>`

### 7. 최종 요약

요약 블록 하나만 출력:

```
🏁 dfx done

요청: <원본 요청 한 줄>
서브태스크: <done>/<total>  (escalated: <e>)
Ralph QC: <iter 수> iters · clean=<yes/no> · stuck=<수>
Acceptance Review: <round 수> rounds · verdict=<APPROVE/REJECT/NEEDS_USER>
잔여 findings: <N> (blocker=<a> · critical=<b> · major=<c> · minor=<d> · nit=<e>)
변경 파일: <count>  (큰 변경 ≥ 5 lines 만)
📁 Audit log: _workspace/<RUN_ID>/

다음 단계 권고:
  · stuck finding / review directive 있으면 사람이 봐야 할 항목으로 안내
  · ...
```

위 요약 블록 전문을 `_workspace/${RUN_ID}/99-summary.md` 에도 저장.

기술 요약 다음에 **사용자 보고서** (Tech Lead Acceptance Review APPROVE 시 작성된 `user_report_md`) 를 부모 chat 에 표시:

```
---

📄 **사용자 보고서** (`_workspace/<RUN_ID>/97-user-report.md`)

<user_report_md 전문 그대로>
```

비전문가 사용자도 읽을 수 있는 markdown — 무슨 문제가 있었고 어떻게 해결했는지 비기술 언어로.

---

## 핵심 규칙

1. **병렬 batch 는 한 어시스턴트 메시지에.** N 개를 병렬로 띄우려면 같은 어시스턴트 턴에 `Task` 호출 N 개. 메시지를 나누면 순차 실행.
2. **출력은 조용히.** batch 사이에 짧은 상태 라인 한 줄만. raw subagent transcript 는 부모 chat 에 노출 금지. 사용자는 깨끗한 부모 chat 을 원함.
3. **본인이 일하지 말 것.** 역할은 subagent spawn. `Read`/`Bash` 는 아래에만:
   - 시작 시 작업 디렉토리 sanity check (`pwd`, `git status -s`)
   - **`_workspace/<RUN_ID>/` audit log 파일 작성** (각 phase 끝마다)
   - subagent JSON 출력 파싱
   - 최종 요약을 위한 `git diff --stat`
4. **외부 서비스 금지.** 백그라운드 daemon·웹서버·DB 어떤 것도 띄우지 않음. 모든 동작은 Task subagent 안에서.
5. **토큰 절약.** 사용자 요청이 trivial 하면 (예: "12번 라인 오타 고쳐줘") triage 생략하고 dev subagent 한 명한테 직접 위임. `🚀 fast path` 출력 후 진행.
6. **실패 처리.** Task 가 실패 (timeout, error) 하면 기록만 하고 진행. 무모한 재시도 금지. 최종 요약에서 노출.

---

## 파이프라인을 돌리지 않는 경우

- 사용자 요청이 task 가 아니라 **질문** → 그냥 답변, 파이프라인 X.
- "어떻게 하면 좋을까?" / "리뷰만 해줘" 식의 변경 없는 요청 → QC step 만 돌림.
- 사용자가 명시적으로 "no QC" / "그냥 해" → QC + Ralph 생략.
