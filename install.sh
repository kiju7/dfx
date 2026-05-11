#!/usr/bin/env bash
# agent-forge 한 줄 설치 스크립트
#
# 사용법:
#   curl -fsSL https://raw.githubusercontent.com/kiju7/agent-forge/main/install.sh | bash
#   또는
#   bash install.sh [설치할_디렉토리]
#
# 기본 디렉토리: ./agent-forge

set -euo pipefail

# ── 출력 헬퍼 ──────────────────────────────────────────────────
c_g="\033[32m"; c_y="\033[33m"; c_r="\033[31m"; c_b="\033[36m"; c_x="\033[0m"
ok()  { printf "${c_g}✓${c_x} %s\n" "$*"; }
info(){ printf "${c_b}→${c_x} %s\n" "$*"; }
warn(){ printf "${c_y}!${c_x} %s\n" "$*"; }
die() { printf "${c_r}✗${c_x} %s\n" "$*" >&2; exit 1; }

# ── 사전 요구사항 점검 ────────────────────────────────────────
info "사전 요구사항 점검"

command -v node >/dev/null 2>&1 || die "Node.js 가 필요합니다. https://nodejs.org 또는 brew install node"
node_major=$(node -p "process.versions.node.split('.')[0]")
[ "$node_major" -ge 20 ] || die "Node.js 20 이상 필요 (현재: $(node --version))"
ok "Node $(node --version)"

command -v git >/dev/null 2>&1 || die "git 이 필요합니다."
ok "git $(git --version | awk '{print $3}')"

if command -v claude >/dev/null 2>&1; then
  ok "claude CLI $(claude --version 2>&1 | head -1)"
else
  warn "claude CLI 가 PATH 에 없습니다. 설치: https://docs.claude.com/claude-code"
  warn "또는 ANTHROPIC_API_KEY 환경변수를 설정해야 합니다."
fi

command -v corepack >/dev/null 2>&1 || die "corepack 이 필요합니다 (Node 16.10+ 에 내장)"
corepack enable pnpm >/dev/null 2>&1 || die "pnpm 활성화 실패"
ok "pnpm $(pnpm --version)"

# ── 설치 디렉토리 결정 ────────────────────────────────────────
TARGET="${1:-./agent-forge}"
TARGET=$(cd "$(dirname "$TARGET")" 2>/dev/null && pwd)/$(basename "$TARGET") || TARGET="$PWD/$(basename "$TARGET")"

info "설치 위치: $TARGET"

# ── 1) 클론 또는 기존 디렉토리 사용 ───────────────────────────
if [ -d "$TARGET/.git" ]; then
  info "기존 레포 발견 — 최신 상태로 업데이트"
  git -C "$TARGET" pull --ff-only || warn "pull 실패 — 수동 확인 필요"
elif [ -d "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  die "디렉토리가 비어있지 않습니다: $TARGET"
else
  info "레포 클론"
  git clone https://github.com/kiju7/agent-forge.git "$TARGET"
fi
ok "소스 준비 완료"

cd "$TARGET"

# ── 2) 의존성 설치 ────────────────────────────────────────────
info "의존성 설치 (~30초)"
pnpm install --silent
ok "의존성 설치 완료"

# ── 3) DB 마이그레이션 ────────────────────────────────────────
info "SQLite 스키마 적용"
pnpm migrate 2>&1 | tail -3
ok "DB 초기화 완료"

# ── 4) 초기 커밋 (필요 시) ────────────────────────────────────
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  info "초기 커밋 생성 (worktree 분기에 필요)"
  git add -A
  git -c user.name="agent-forge-bootstrap" -c user.email="bootstrap@local" commit -q -m "initial"
fi
ok "git 상태 OK"

# ── 5) /forge 슬래시 커맨드 글로벌 설치 ───────────────────────
info "Claude Code 슬래시 커맨드 /forge 설치"
mkdir -p ~/.claude/commands

# 경로 치환해서 복사
TARGET_ESCAPED=$(printf '%s\n' "$TARGET" | sed 's:[\/&]:\\&:g')
sed "s|/Users/jd-kimkiju/Projects/agent-forge|$TARGET|g" \
  "$TARGET/.claude/commands/forge.md" > ~/.claude/commands/forge.md
ok "/forge 글로벌 등록 완료 (~/.claude/commands/forge.md)"

# ── 6) 완료 메시지 ────────────────────────────────────────────
cat <<EOF

${c_g}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c_x}
${c_g}✓${c_x} agent-forge 설치 완료

${c_b}위치:${c_x}        $TARGET
${c_b}슬래시:${c_x}      /forge  (어디서든 Claude Code 안에서 사용 가능)
${c_b}대시보드:${c_x}    http://localhost:3000  (기동 후)
${c_b}오케스트레이터:${c_x} http://127.0.0.1:4317  (기동 후)

${c_b}다음 단계:${c_x}

  ${c_y}1.${c_x}  Claude Code 실행:
      ${c_g}claude${c_x}

  ${c_y}2.${c_x}  /forge 입력
      자동으로 오케스트레이터·대시보드 백그라운드 기동.
      그 다음부터는 자연어로 작업 설명만 하면 끝.

  ${c_y}3.${c_x}  예시:
      ${c_g}> 칸반 카드 마우스 호버 시 배경 살짝 밝아지게${c_x}

${c_b}문서:${c_x}  $TARGET/README.md
${c_g}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c_x}
EOF
