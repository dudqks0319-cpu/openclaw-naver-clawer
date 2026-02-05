# Naver Blog Crawler

멍개의 연구소 네이버 블로그 크롤러

## 기능

- ✅ 네이버 블로그 포스트 목록 수집
- ✅ 각 포스트의 제목, 날짜, 본문, 이미지 추출
- ✅ JSON 파일로 저장
- ✅ 마크다운 파일로 저장
- ✅ Playwright를 이용한 동적 페이지 크롤링

## 설치

```bash
npm install
```

Playwright 브라우저 설치:
```bash
npx playwright install chromium
```

## 사용법

### 기본 실행 (10개 포스트)

```bash
npm start
```

### 커스터마이징

`crawler.js` 파일에서 설정 변경:

```javascript
const blogId = 'pjt3591oo'; // 크롤링할 블로그 ID
const posts = await crawler.crawlAll(10); // 최대 포스트 수
```

## 출력

### 1. JSON 파일
`naver_blog_posts.json` - 모든 포스트 데이터가 JSON 형식으로 저장

```json
[
  {
    "url": "https://blog.naver.com/...",
    "title": "포스트 제목",
    "date": "2024.12.22.",
    "content": "본문 내용...",
    "images": ["이미지URL1", "이미지URL2"],
    "crawledAt": "2026-02-05T05:44:00.000Z"
  }
]
```

### 2. 마크다운 파일
`posts/` 폴더에 각 포스트별 마크다운 파일 생성

```
posts/
  ├── 20241222_멍개의_2024년_회고록.md
  ├── 20221225_멍개의_2022년_회고록.md
  └── ...
```

## 주의사항

⚠️ **네이버 블로그 크롤링 시 주의사항:**
- 네이버 이용약관 준수 필요
- 과도한 요청은 IP 차단 위험
- 개인적인 용도로만 사용
- 포스트 간 1-2초 간격 유지

## 기술 스택

- **Node.js** - 런타임
- **Playwright** - 브라우저 자동화
- **Cheerio** - HTML 파싱 (선택적)

## 문제 해결

### "브라우저를 찾을 수 없습니다" 오류

```bash
npx playwright install chromium
```

### iframe 접근 오류

네이버 블로그는 iframe을 사용합니다. 스크립트가 자동으로 iframe을 감지하지만, 문제가 있다면 headless: false로 설정하여 디버깅하세요:

```javascript
this.browser = await chromium.launch({ 
  headless: false // 브라우저 창 표시
});
```

## 라이선스

MIT
