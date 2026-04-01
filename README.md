# Naver Blog Crawler

멍개의 연구소 네이버 블로그 크롤러 (Naver Blog 전용)

## 기능

- ✅ 네이버 블로그 포스트 목록 수집
- ✅ 각 포스트의 제목, 날짜, 본문, 이미지 추출
- ✅ JSON 결과 저장
- ✅ 마크다운 파일 저장
- ✅ CLI/환경변수로 동작 제어 가능

## 설치

```bash
npm install
```

Playwright 브라우저 설치:

```bash
npx playwright install chromium
```

## 기본 실행

```bash
npm start
```

기본값은 블로그 ID `pjt3591oo`, 최대 `5`개 포스트, `2.5초 + 0~1초` 지연입니다.

## 설정 (CLI)

`crawler.js`를 수정하지 않고 다음 옵션으로 조절할 수 있습니다.

```bash
node crawler.js \
  --blog-id pjt3591oo \
  --max-posts 5 \
  --max-pages 5 \
  --request-delay-ms 2500 \
  --request-jitter-ms 1000 \
  --max-retries 2 \
  --retry-delay-ms 1000 \
  --navigation-timeout-ms 45000 \
  --action-timeout-ms 15000 \
  --headless true \
  --output-json naver_blog_posts.json \
  --output-dir posts
```

### CLI 옵션 요약

- `--blog-id` (기본: `pjt3591oo`)
- `--max-posts` (기본: `5`)
- `--max-pages` (기본: `5`)
- `--request-delay-ms` (기본: `2500`)
- `--request-jitter-ms` (기본: `1000`)
- `--max-retries` (기본: `2`)
- `--retry-delay-ms` (기본: `1000`)
- `--navigation-timeout-ms` (기본: `45000`)
- `--action-timeout-ms` (기본: `15000`)
- `--max-content-length` (기본: `5000`)
- `--max-images-per-post` (기본: `10`)
- `--headless` (기본: `true`)
- `--output-json` (기본: `naver_blog_posts.json`)
- `--output-dir` (기본: `posts`)

### 지원 환경변수

- `NAVER_BLOG_ID`
- `NAVER_MAX_POSTS`
- `NAVER_MAX_PAGES`
- `NAVER_REQUEST_DELAY_MS`
- `NAVER_REQUEST_JITTER_MS`
- `NAVER_MAX_RETRIES`
- `NAVER_RETRY_DELAY_MS`
- `NAVER_NAVIGATION_TIMEOUT_MS`
- `NAVER_ACTION_TIMEOUT_MS`
- `NAVER_MAX_CONTENT_LENGTH`
- `NAVER_MAX_IMAGES_PER_POST`
- `NAVER_HEADLESS`
- `NAVER_OUTPUT_JSON`
- `NAVER_OUTPUT_DIR`

환경변수는 동일 기능의 CLI 옵션보다 우선순위가 낮습니다.

## 출력

### JSON

기본 파일: `naver_blog_posts.json`

### 마크다운

기본 폴더: `posts/`

## 보안/안정성 개선 포인트

- 출력 경로는 상대경로만 허용하고 `../` 같은 경로 이탈을 막습니다.
- 파일명은 특수문자 제거/정규화 후 저장합니다.
- 네트워크/레이아웃 실패 시 재시도 + 지수 백오프, 프레임 탐색 실패 시 fallback 처리.
- 크롤링 예외가 나도 전체 프로세스를 중단하지 않고 다음 글로 넘어갑니다.

## 준수/비침투 운영 가이드

본 크롤러는 우회/우회 기법(stealth/evasion/anti-detection bypass)을 사용하지 않습니다.
기본 동작은 보수적으로 구성되어 있으며,

- 요청 간격이 짧지 않도록 `request-delay-ms`, `request-jitter-ms` 값으로 대기
- 기본 최대 수집 개수는 5개

로 설정되어 있습니다.

> **운영 권고**: 네이버 이용약관 및 robots 정책을 확인한 뒤 사용하세요. 과도한 요청은 계정/IP 제한, 접근 제한의 원인이 될 수 있습니다.

## 문제 해결

- 블로그를 열 수 없다면 브라우저가 최신인지 확인 (`npx playwright install chromium`)
- 리스트/본문이 비어보이면 네이버 UI 변경 가능성이 있습니다.
- 경로 차단 오류가 뜨면 실행 권한/네트워크 상태, 사용자 환경을 점검하세요.

## 테스트

네트워크에 의존하지 않는 단위 테스트:

```bash
npm test
```

`parseConfig`, 경로/파일명 처리 로직을 검증합니다.

## 라이선스

MIT
