# dfx

Claude Code 와 Codex 에서 쓰는 **적응형 다중 에이전트 엔지니어링 스킬**입니다. 요청의 결합도·난이도·검증 결과를 보고 팀 크기와 모델을 고르고, 근거 기반으로 검증한 뒤 사람 검토용으로 인계합니다. 고정 파이프라인이나 필수 에이전트 수는 없습니다.

| 호스트 | 진입점 | 설치·사용 |
|---|---|---|
| Claude Code | `/dfx:dfx "<요청>"` | 아래 |
| Codex | `$dfx <요청>` | [codex/README.md](codex/README.md) |

## Claude Code

### 설치

```
/plugin marketplace add kiju7/dfx
/plugin install dfx@kiju7-dfx
```

수동 설치(오프라인):

```bash
git clone https://github.com/kiju7/dfx.git /tmp/dfx
mkdir -p ~/.claude/agents ~/.claude/skills
cp /tmp/dfx/agents/*.md ~/.claude/agents/
cp -r /tmp/dfx/skills/dfx ~/.claude/skills/
```

개인 설치는 네임스페이스가 없으므로 `/dfx` 로 호출하고 에이전트 이름은 `worker`/`reviewer` 입니다.

### 사용

```
/dfx:dfx "사용자 프로필 수정 기능 구현하고 검증해줘. 최종 점검은 내가 할게."
/dfx:dfx "이 버그 재현하고 고쳐줘"
```

### 실행 정책

| 상황 | 동작 |
|---|---|
| 작은 수정 | 조정자가 직접 구현·확인. 별도 에이전트·기록 없음 |
| 결합된 변경 | 담당자 1명이 탐색·구현·테스트. 필요하면 독립 리뷰어 1명 |
| 독립적인 변경들 | 의존성·파일 소유권을 정한 뒤 `dfx:worker` 병렬 위임, 조정자가 통합 |
| 원인·설계 불확실 | 표적 증거를 먼저 얻고 구현. 해석이 갈리면 선택지 2~3개로 질문 |

모델은 작업 증거에 따라 `haiku / sonnet / opus / fable` 중 고릅니다. 역할별 고정이 아니며 사용자 지시가 우선합니다. 기준은 [routing.md](skills/dfx/references/routing.md). 리뷰(엣지 케이스·보안·성능·UX)는 조건부이고, 리뷰 렌즈가 3개 이상이거나 수렴 라운드가 여러 번 예상되면 Claude Code 의 `Workflow` 도구로 돌립니다. 에이전트 목록에 Codex 플러그인(`codex:codex-rescue`)이 있으면 영향 큰 변경에 교차 벤더 리뷰 1회를 추가합니다.

같은 작업 트리에 동시 쓰기는 하지 않습니다. 병렬 쓰기는 worktree 격리 또는 소유 파일 분리 + 빌드 직렬화로만 합니다. 다단계 작업은 대상 프로젝트의 `_workspace/dfx/<run-id>/` 에 `run.json` 과 `report.md` 를 남깁니다(커밋 제외).

### 구조

```
skills/dfx/SKILL.md              # 짧은 진입점
skills/dfx/references/
  routing.md                     # 모델 선택·승급 규칙
  delegation.md                  # Agent/Workflow 어댑터, 분할, 브리프 계약
  verification.md                # 완료 기준, 복구 한도, run.json/report.md
  domains.md                     # 도메인 체크리스트(필요한 절만 브리프에)
agents/worker.md                 # build/explore 담당(전체 도구, 재위임 없음)
agents/reviewer.md               # 읽기 전용 독립 리뷰어(증거 있는 finding 만)
```

v1(고정 파이프라인: triage → Tech Lead → 7 dev → 4 QC → Ralph 루프, 에이전트 13개)은 [`claude` 브랜치](https://github.com/kiju7/dfx/tree/claude) 이력과 `v1.0.2` 태그에 보존됩니다.

## 검증과 설계 근거

```bash
python3 -m unittest discover -s scripts -p 'test_*.py'
```

행동 평가는 임시 저장소에서 독립 에이전트로 실행합니다([codex/evals/scenarios.md](codex/evals/scenarios.md)). 실제 확인한 범위는 [Claude 2026-09-14](evals/claude-results-2026-09-14.md), [Codex 2026-09-14](codex/evals/results-2026-09-14.md) 에 있습니다. 스모크 테스트는 품질·비용 개선의 증명이 아닙니다.

설계 근거(2026-09 확인):

- [Anthropic: When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them) — 멀티에이전트는 토큰 3~10배, 문맥 기준 분할, 명시적 완료 기준을 가진 검증자.
- [Google Research: Towards a science of scaling agent systems](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) — 병렬 가능 작업은 중앙 조정으로 이득, 순차 작업은 손해.
- [OpenAI: Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) — 라우터형 스킬, 필요한 참고자료만 로드, done 기준 선정의.
- [Claude Code: Subagents](https://code.claude.com/docs/en/sub-agents), [Codex: Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) — 네이티브 위임과 모델 선택.
- 참고한 공개 스킬: [obra/superpowers](https://github.com/obra/superpowers)(작업별 fresh subagent + 2단계 리뷰), [benzhuk/claude-delegation](https://github.com/benzhuk/claude-delegation)(벤더 중립 tier, 부하 기반 동시 실행 예산), [Z-M-Huang/claude-codex](https://github.com/Z-M-Huang/claude-codex)(교차 벤더 리뷰).

- **레포** · <https://github.com/kiju7/dfx>
- **이슈** · GitHub Issues
