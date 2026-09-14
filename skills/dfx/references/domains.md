# 도메인 지침 (브리프에 필요한 절만 붙임)

각 절은 worker 또는 reviewer 브리프에 그대로 붙일 수 있는 짧은 주의점입니다. 검토 중인 위험에 해당하는 절만 씁니다. 전부 붙이지 않습니다.

## 공통 (모든 build 브리프)

- 스택·컨벤션은 `package.json`/`go.mod`/`pyproject.toml` 과 `CLAUDE.md`/`README.md`, 수정할 파일의 이웃에서 확인. 새 기술 도입 금지.
- 최소 변경. drive-by 정리·조기 추상화 금지. 요청된 것만.
- 타입 검사·lint·build 를 완료 전에 실행. 관찰 가능한 로직이 바뀌면 변경 전 실패하고 변경 후 통과하는 reproducer 를 프로젝트 테스트 인프라(없으면 임시 디렉토리)에 둠.
- 편집 전 브리프의 가정이 코드와 맞는지 확인. grep 결과는 후보일 뿐이며 import·실제 사용처를 봐야 확정. "비활성화/정리/단순화" 같은 동사는 toggle·flag·config 분기 존재 여부로 해석을 정하고, 둘 다 합리적이면 `needs_decision` 으로 보고.

## Frontend

- 프레임워크(Next.js/Vite/Vue/순수)와 CSS 방식(Tailwind/modules/plain)을 맞춤. 새 `any` 금지.
- 서버/클라이언트 컴포넌트 경계, 불필요한 re-render, 누락된 memo 는 성능 렌즈에서 확인.

## Backend

- 비즈니스 로직은 비즈니스 레이어에. 신뢰할 수 없는 입력은 경계에서 검증하고 안쪽은 타입을 신뢰.
- 다단계 쓰기는 프로젝트 패턴대로 트랜잭션. 바뀐 성공·실패 계약의 소비자를 실행.

## Database

- forward-only 마이그레이션. 이미 커밋된 마이그레이션 수정 금지, 다음 시퀀스로 새 파일.
- 롤아웃 중 옛 read 가 살아 있도록 하위 호환. drop 은 후속 마이그레이션에서.
- 인덱스는 구체적 쿼리 패턴이 있을 때만. composite 는 equality 먼저, range 나중.
- 제약·트리거는 invariant 용이지 비즈니스 규칙 용이 아님.

## Daemon / Worker

- 재시작 안전(idempotent). 중간에 죽은 워커의 재시도가 같은 결과를 내야 함.
- 무한 큐 금지: cap, 이유 있는 drop, block 중 택일. 모든 socket/watcher/connection 에 teardown 경로.
- 이벤트 스키마는 additive 변경만.

## DevOps / 인프라

- 선언적 우선(YAML/Dockerfile/Terraform > 셸). 버전 핀, `latest` 금지, lockfile 커밋.
- 시크릿 인라인 금지. env/secret manager. 앱 코드는 건드리지 않음.

## AI / 프롬프트 / 에이전트 정의

- 에이전트 Markdown 의 frontmatter(`name | description | model | tools`)가 canonical 스키마.
- 기존 PreToolUse/path/tool 가드를 이유 없이 약화하지 않음. 구조화 출력 계약을 깨면 호출자도 갱신.

## UX

- 색·spacing·typography 는 토큰 원천에. 인라인 금지. 본문 대비 4.5:1 이상, 가시 포커스, 필요할 때만 ARIA.
- 기존 보이스·용어(한국어/영어 혼용 규칙) 유지.

## 리뷰 렌즈 (reviewer 브리프에 해당 렌즈만)

- **엣지 케이스:** null/빈 값/0/음수/NaN/거대 입력, off-by-one, 단일 요소, 유니코드·이모지·RTL, 동시성(누락된 await, race), 에러 경로(unhandled rejection, try/catch 누락).
- **보안:** injection(SQL/command/prompt), XSS·신뢰 못할 HTML, 인증·권한 우회(server action, middleware), 시크릿 노출(.env, 클라이언트 번들), path traversal·안전하지 않은 파일 접근, 에이전트 권한 escape.
- **성능:** N+1, 루프 안 동기 I/O, 메인 스레드 블로킹(큰 parse/sort/regex backtracking), 리스너 누수, hot 쿼리의 인덱스 누락, 직렬화된 await 중 병렬 가능한 것.
- **UX/접근성:** 키보드 내비게이션·tab order, 대비, empty/loading/error 상태, 터치 타깃 44px, 라벨·role 정확성, copy 일관성, 토큰 일관성.

리뷰어는 `git diff HEAD` 가 신규(untracked) 파일을 보여주지 않으므로 `git status` 로 신규 파일을 먼저 찾아 직접 읽습니다. finding 후보는 실제로 실행·재현·렌더해 본 뒤 재현된 것만 보고하고, 재현되지 않은 가설은 `suspected` 로 낮춥니다. 구현자가 의도적으로 결정했다고 브리프에 적힌 사항은 finding 이 아닙니다.
