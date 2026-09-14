# dfx for Codex

Codex 기본 하위 에이전트로 작업을 수행하는 `$dfx` 스킬입니다. 작업의 결합도,
난이도, 검증 결과를 보고 팀 구성과 GPT 모델·effort를 선택합니다. 기존 Claude
버전의 고정 파이프라인을 그대로 옮기지 않았습니다.

## 설치와 사용

Python 3와 Codex가 있는 환경에서 저장소의 `codex` 브랜치를 사용합니다.

```bash
git clone --branch codex https://github.com/kiju7/dfx.git
cd dfx
python3 scripts/install_codex_skill.py
python3 scripts/install_codex_skill.py --check
```

기본 설치 위치는 `${CODEX_HOME:-~/.codex}/skills/dfx`이며 소스 폴더를 가리키는
심볼릭 링크입니다. `--skills-dir`는 해당 Codex 환경이 이미 탐색하는 스킬
디렉토리를 지정할 때 사용합니다. 임의의 경로를 자동으로 탐색 목록에 등록하지
않습니다. **한 환경에서는 경로 하나만 선택**하세요. 기존 다른 스킬은
덮어쓰지 않으며 모델·권한 설정도 변경하지 않습니다.

Codex에서 다음과 같이 요청하세요.

```text
$dfx 사용자 프로필 수정 기능을 구현하고 검증해줘. 최종 점검은 내가 할게.
$dfx 이 버그를 재현하고 수정해줘. 작업별로 모델과 effort를 선택해줘.
```

자동 선택도 허용되어 있습니다. 설치 후 목록에 나타나지 않으면 새 Codex
세션을 시작하세요. 이미 열린 대화에서는 `codex/skills/dfx/SKILL.md`의 절대
경로를 읽어 사용하도록 요청할 수도 있습니다.

업데이트는 같은 checkout에서 `git pull --ff-only`하면 링크에 반영됩니다.
checkout을 삭제하거나 Claude 전용 브랜치로 바꾸면 링크가 작동하지 않을 수
있으므로 Codex용 checkout을 유지하세요. 제거:

```bash
python3 scripts/install_codex_skill.py --uninstall
```

## 실행 정책

| 상황 | 동작 |
|---|---|
| 작은 수정 | 직접 구현·확인, 별도 분류/QC 에이전트 생략 |
| 독립적인 변경 | 파일 소유권과 의존성을 정한 뒤 병렬 위임 |
| 밀접하게 연결된 변경 | 한 담당자가 구현·검증, 필요한 독립 리뷰 추가 |
| 불확실한 결함 | 필요한 조사 후 구현; 정체하면 재계획 또는 모델 승급 |
| 해석이 갈리는 설계 | 코드를 읽은 뒤 선택지 2~3개와 추천안으로 질문(무인 실행이면 추천안 진행 + 가정 기록) |

리뷰(엣지 케이스·보안·성능·UX)는 조건부이며 렌즈별 주의점은
[domains.md](skills/dfx/references/domains.md)에서 필요한 절만 브리프에 붙입니다.
다른 모델 계열의 교차 리뷰는 사용자가 허용한 수단으로만 선택적으로 수행합니다.

모델 기본 후보는 Luna / Terra / Sol / Astra입니다. 역할별 고정 모델이 아니며
실제 제공 모델과 사용자 지시가 우선합니다. 현재 부모 모델은 스킬이 바꾸지
않습니다. 세부 선택 기준은 [routing.md](skills/dfx/references/routing.md).

호스트의 `spawn_agent` 또는 `collaboration` 도구를 사용합니다. 모델/effort
지정, fork 방식, 동시 실행 수는 호스트 스키마를 따릅니다. 도구가 없으면 이를
알리고 단독 수행하며, 별도 CLI를 몰래 실행해 다중 에이전트처럼 표시하지 않습니다.
Claude의 `Task`나 `agents/*.md` 등록에 의존하지 않습니다.

여러 단계의 작업은 대상 프로젝트 `_workspace/dfx/<run-id>/`에 복구 기록과
검토 보고서를 남깁니다. 기록은 프롬프트 기반이며 강제 스케줄러가 아닙니다.
모델에 요청한 설정과 런타임에서 확인한 설정을 구분합니다. 사용량이 제공되지
않으면 미확인으로 보고하며, 비용 절감 수치를 추정해 사실처럼 표시하지 않습니다.

## 검증과 설계 근거

```bash
python3 -m unittest discover -s scripts -p 'test_*.py'
```

[평가 사례](evals/scenarios.md)는 독립된 임시 저장소에서 실행합니다. 문법 검증과
스모크 테스트는 장기 품질·비용 개선을 입증하지 않습니다. 단일 에이전트와 동일
과제에서 완료율, 회귀, 재작업, 시간, 관찰 가능한 사용량을 비교해야 합니다.
실제 확인한 범위는 [2026-09-14 검증 기록](evals/results-2026-09-14.md)에 정리했습니다.

2026-09-14 확인한 설계 근거:

- [OpenAI: Astra 스킬·프롬프트 지침](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra): 짧은 진입점과 필요한 참고자료만 읽는 구성.
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents): 네이티브 위임과 모델·effort 선택.
- [Co-Coder](https://arxiv.org/abs/2606.00953): 의존성을 고려한 분할. 제한된 평가의 연구 결과로, 이 스킬의 성능 보장이 아닙니다.
- [Google Research](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/): 작업 특성에 따른 단독·병렬 선택.

Claude용 파일은 루트 `skills/dfx`, `agents`, `.claude-plugin`에 유지됩니다.
