import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'node:url';

const DEFAULT_CONFIG = {
  blogId: 'pjt3591oo',
  maxPosts: 5,
  maxPages: 5,
  requestDelayMs: 2500,
  requestJitterMs: 1000,
  maxRetries: 2,
  retryDelayMs: 1000,
  navigationTimeoutMs: 45000,
  actionTimeoutMs: 15000,
  maxContentLength: 5000,
  maxImagesPerPost: 10,
  headless: true,
  outputJson: 'naver_blog_posts.json',
  outputDir: 'posts',
};

const POST_LINK_URL_HINTS = ['/PostView.naver', '/PostView.nhn'];

const FRAME_HINTS = {
  list: {
    urlHints: ['PostList', 'blog.naver.com'],
    frameSelectors: [
      'iframe#mainFrame',
      'iframe[name="mainFrame"]',
      'iframe[src*="PostList"]',
      'iframe[src*="blog.naver.com"]',
    ],
  },
  post: {
    urlHints: ['/PostView', 'PostView.naver', 'PostView.nhn'],
    frameSelectors: [
      'iframe#mainFrame',
      'iframe[name="mainFrame"]',
      'iframe[src*="PostView"]',
      'iframe[src*="postView"]',
    ],
  },
};

const TITLE_SELECTORS = [
  '.se-title-text',
  'h3.se_textarea',
  '.pcol1',
  'h1',
  '.post-title',
];

const DATE_SELECTORS = [
  '.se_publishDate',
  '.se-date',
  '.blog2_series',
  '.date',
  '.byline',
];

const CONTENT_SELECTORS = [
  '.se-main-container',
  '.post-view',
  '.se_component_wrap',
  'article',
  'main',
];

const IMAGE_SELECTORS = [
  'img.se-image-resource',
  'img.__se_img_el',
  '.se-main-container img',
  '.post-view img',
  'article img',
];

async function getChromium() {
  const playwright = await import('playwright');
  return playwright.chromium;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    const equalsIndex = arg.indexOf('=');
    if (equalsIndex === -1) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        parsed[key] = next;
        i += 1;
      } else {
        parsed[key] = 'true';
      }
      continue;
    }

    const key = arg.slice(2, equalsIndex);
    const value = arg.slice(equalsIndex + 1);
    parsed[key] = value;
  }

  return parsed;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parsePositiveInt(value, fallback, min = 1) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= min) {
    return parsed;
  }
  return fallback;
}

function resolveSafeRelativePath(rawPath, kind = 'file') {
  if (typeof rawPath !== 'string') {
    throw new Error(`Invalid ${kind} path`);
  }

  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new Error(`Empty ${kind} path`);
  }

  const normalized = path.normalize(trimmed);
  const invalidChars = /[<>:"|?*]/;
  if (invalidChars.test(normalized) || path.isAbsolute(normalized)) {
    throw new Error(`Unsafe ${kind} path: ${rawPath}`);
  }

  const traversalPattern = /(^|\/|\\)\.\.($|\/|\\)/;
  if (traversalPattern.test(normalized)) {
    throw new Error(`Path traversal blocked: ${rawPath}`);
  }

  return normalized;
}

export function sanitizeForFilename(value, maxLength = 120) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/\.{2,}/g, '.');

  return normalized.slice(0, maxLength);
}

export function buildMarkdownFilename(post, maxLength = 120) {
  const datePart = (post.date || 'unknown').replace(/[^0-9]/g, '').slice(0, 12) || 'unknown';
  const titlePart = sanitizeForFilename(post.title || 'post', 60) || 'post';
  const hash = crypto
    .createHash('sha1')
    .update(post.url || post.title || '')
    .digest('hex')
    .slice(0, 8);

  const filename = `${datePart}_${titlePart}_${hash}.md`;
  return sanitizeForFilename(filename, maxLength);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseConfig(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);

  if (args.help) {
    return {
      help: true,
      ...DEFAULT_CONFIG,
    };
  }

  return {
    blogId: args['blog-id'] || args.blogId || env.NAVER_BLOG_ID || env.BLOG_ID || DEFAULT_CONFIG.blogId,
    maxPosts: parsePositiveInt(args['max-posts'] || args.maxPosts, env.NAVER_MAX_POSTS ? Number(env.NAVER_MAX_POSTS) : DEFAULT_CONFIG.maxPosts),
    maxPages: parsePositiveInt(args['max-pages'] || args.maxPages, env.NAVER_MAX_PAGES ? Number(env.NAVER_MAX_PAGES) : DEFAULT_CONFIG.maxPages),
    requestDelayMs: parsePositiveInt(args['request-delay-ms'] || args.requestDelayMs, env.NAVER_REQUEST_DELAY_MS ? Number(env.NAVER_REQUEST_DELAY_MS) : DEFAULT_CONFIG.requestDelayMs),
    requestJitterMs: parsePositiveInt(args['request-jitter-ms'] || args.requestJitterMs, env.NAVER_REQUEST_JITTER_MS ? Number(env.NAVER_REQUEST_JITTER_MS) : DEFAULT_CONFIG.requestJitterMs),
    maxRetries: parsePositiveInt(args['max-retries'] || args.maxRetries, env.NAVER_MAX_RETRIES ? Number(env.NAVER_MAX_RETRIES) : DEFAULT_CONFIG.maxRetries, 0),
    retryDelayMs: parsePositiveInt(args['retry-delay-ms'] || args.retryDelayMs, env.NAVER_RETRY_DELAY_MS ? Number(env.NAVER_RETRY_DELAY_MS) : DEFAULT_CONFIG.retryDelayMs, 0),
    navigationTimeoutMs: parsePositiveInt(args['navigation-timeout-ms'] || args.navigationTimeoutMs, env.NAVER_NAVIGATION_TIMEOUT_MS ? Number(env.NAVER_NAVIGATION_TIMEOUT_MS) : DEFAULT_CONFIG.navigationTimeoutMs),
    actionTimeoutMs: parsePositiveInt(args['action-timeout-ms'] || args.actionTimeoutMs, env.NAVER_ACTION_TIMEOUT_MS ? Number(env.NAVER_ACTION_TIMEOUT_MS) : DEFAULT_CONFIG.actionTimeoutMs),
    maxContentLength: parsePositiveInt(args['max-content-length'] || args.maxContentLength, env.NAVER_MAX_CONTENT_LENGTH ? Number(env.NAVER_MAX_CONTENT_LENGTH) : DEFAULT_CONFIG.maxContentLength, 1),
    maxImagesPerPost: parsePositiveInt(args['max-images-per-post'] || args.maxImagesPerPost, env.NAVER_MAX_IMAGES_PER_POST ? Number(env.NAVER_MAX_IMAGES_PER_POST) : DEFAULT_CONFIG.maxImagesPerPost),
    headless: parseBoolean(
      args.headless,
      parseBoolean(env.NAVER_HEADLESS, DEFAULT_CONFIG.headless),
    ),
    outputJson: resolveSafeRelativePath(
      args['output-json'] || args.outputJson || env.NAVER_OUTPUT_JSON || DEFAULT_CONFIG.outputJson,
      'output-json',
    ),
    outputDir: resolveSafeRelativePath(
      args['output-dir'] || args.outputDir || env.NAVER_OUTPUT_DIR || DEFAULT_CONFIG.outputDir,
      'output-dir',
    ),
  };
}

function getUsage() {
  return `
네이버 블로그 크롤러 사용법

` +
    `실행:
  node crawler.js [옵션]

` +
    `주요 옵션:
  --blog-id <id>             크롤링할 네이버 블로그 ID (기본: ${DEFAULT_CONFIG.blogId})
  --max-posts <number>       최대 수집 포스트 수 (기본: ${DEFAULT_CONFIG.maxPosts})
  --max-pages <number>       목록 페이지 탐색 범위 (기본: ${DEFAULT_CONFIG.maxPages})
  --request-delay-ms <number> 포스트 요청 간 기본 대기(ms) (기본: ${DEFAULT_CONFIG.requestDelayMs})
  --request-jitter-ms <num>  랜덤 가감(jitter) 범위(ms, 0~) (기본: ${DEFAULT_CONFIG.requestJitterMs})
  --max-retries <number>     실패 재시도 횟수 (기본: ${DEFAULT_CONFIG.maxRetries})
  --retry-delay-ms <number>  재시도 지연 기본(ms) (기본: ${DEFAULT_CONFIG.retryDelayMs})
  --headless <bool>          브라우저 헤드리스 모드 (기본: ${DEFAULT_CONFIG.headless})
  --output-json <path>       JSON 저장 경로 (기본: ${DEFAULT_CONFIG.outputJson})
  --output-dir <path>        마크다운 저장 폴더 (기본: ${DEFAULT_CONFIG.outputDir})

` +
    `환경 변수:
  NAVER_BLOG_ID, NAVER_MAX_POSTS, NAVER_MAX_PAGES, NAVER_REQUEST_DELAY_MS, NAVER_REQUEST_JITTER_MS,
  NAVER_MAX_RETRIES, NAVER_RETRY_DELAY_MS, NAVER_NAVIGATION_TIMEOUT_MS, NAVER_ACTION_TIMEOUT_MS,
  NAVER_MAX_CONTENT_LENGTH, NAVER_MAX_IMAGES_PER_POST, NAVER_HEADLESS, NAVER_OUTPUT_JSON, NAVER_OUTPUT_DIR
`;
}

class NaverBlogCrawler {
  constructor(rawConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...rawConfig };
    this.baseUrl = `https://blog.naver.com/${this.config.blogId}`;
    this.posts = [];
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init() {
    console.log('🚀 브라우저 시작...');

    const chromium = await getChromium();

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.actionTimeoutMs);
    this.page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);
  }

  async withRetry(operation, options = {}) {
    const {
      label = 'operation',
      attempts = this.config.maxRetries + 1,
      baseDelayMs = this.config.retryDelayMs,
    } = options;

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) {
          console.error(`❌ [${label}] 마지막 시도 실패: ${error.message}`);
          throw error;
        }

        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`⚠️ [${label}] 실패(시도 ${attempt}/${attempts - 1}), ${delay}ms 후 재시도...`);
        await sleep(delay);
      }
    }

    throw lastError;
  }

  async findFrameWithHints(target, timeoutMs = this.config.actionTimeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const frame = await this.findFrameOnce(target);
      if (frame) {
        return frame;
      }
      await this.page.waitForTimeout(250);
    }

    return null;
  }

  async findFrameOnce(target = {}) {
    const { urlHints = [], frameSelectors = [] } = target;
    const frames = this.page.frames();

    if (urlHints.length > 0) {
      const matchByUrl = frames.find((candidateFrame) => {
        const frameUrl = candidateFrame.url() || '';
        return urlHints.some((hint) => frameUrl.includes(hint));
      });
      if (matchByUrl) {
        return matchByUrl;
      }
    }

    for (const selector of frameSelectors) {
      const iframe = await this.page.$(selector);
      if (iframe) {
        const contentFrame = await iframe.contentFrame();
        if (contentFrame) {
          return contentFrame;
        }
      }
    }

    return this.page;
  }

  normalizePostUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, this.baseUrl);
      if (!url.hostname.includes('blog.naver.com')) {
        return null;
      }

      const isPostLink = POST_LINK_URL_HINTS.some((hint) => url.pathname.includes(hint) || url.href.includes(hint));
      if (!isPostLink) {
        return null;
      }

      url.search = '';
      url.hash = '';
      return url.href;
    } catch {
      return null;
    }
  }

  async extractPostLinksFromFrame(frame, maxPages) {
    const anchors = await frame.$$eval('a[href]', (elements) => elements.map((el) => ({
      href: el.href || '',
      text: (el.textContent || '').trim(),
    })));

    const seen = new Set();
    const posts = [];

    for (const item of anchors) {
      const normalized = item.href;
      if (!normalized || !POST_LINK_URL_HINTS.some((hint) => normalized.includes(hint))) {
        continue;
      }

      if (!seen.has(normalized)) {
        seen.add(normalized);
        posts.push({
          url: normalized,
          title: item.text || '제목 없음',
        });
      }
    }

    return posts.slice(0, maxPages * 10);
  }

  async getPostList(maxPages = this.config.maxPages) {
    console.log(`📚 블로그 목록 수집 시작: ${this.baseUrl}`);

    return this.withRetry(async () => {
      await this.page.goto(this.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.navigationTimeoutMs,
      });

      const frame = await this.findFrameWithHints(FRAME_HINTS.list, this.config.actionTimeoutMs);
      if (!frame) {
        throw new Error('블로그 프레임을 찾을 수 없습니다.');
      }

      const posts = await this.extractPostLinksFromFrame(frame, maxPages);
      console.log(`📝 발견된 포스트 수: ${posts.length}`);
      return posts;
    }, { label: '목록 수집' });
  }

  async extractFirstText(frame, selectors) {
    for (const selector of selectors) {
      const value = await frame.$eval(selector, (el) => (el.textContent || '').trim()).catch(() => '');
      if (value) {
        return value;
      }
    }

    return '';
  }

  async extractBodyText(frame) {
    const body = await frame.$eval('body', (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).catch(() => '');
    return body || '';
  }

  async extractContent(frame) {
    let best = '';

    for (const selector of CONTENT_SELECTORS) {
      const value = await frame.$eval(selector, (el) => (el.textContent || '').trim()).catch(() => '');
      if (value && value.length > best.length) {
        best = value;
      }
    }

    if (!best) {
      best = await this.extractBodyText(frame);
    }

    return best.replace(/\s{2,}/g, '\n\n').trim().slice(0, this.config.maxContentLength);
  }

  async extractImages(frame) {
    const imageUrls = await frame
      .$$eval(IMAGE_SELECTORS.join(', '), (images) => images
        .map((img) => img.src || img.getAttribute('data-lazy-src') || '')
        .filter((src) => src && /^https?:/.test(src)))
      .catch(() => []);

    const unique = [...new Set(imageUrls)];
    return unique.slice(0, this.config.maxImagesPerPost);
  }

  async crawlPost(postUrl) {
    console.log(`📖 포스트 크롤링: ${postUrl}`);

    return this.withRetry(async () => {
      await this.page.goto(postUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.navigationTimeoutMs,
      });

      const frame = await this.findFrameWithHints(FRAME_HINTS.post, this.config.navigationTimeoutMs);
      if (!frame) {
        throw new Error('포스트 프레임을 찾을 수 없습니다.');
      }

      const title = await this.extractFirstText(frame, TITLE_SELECTORS);
      const date = await this.extractFirstText(frame, DATE_SELECTORS);
      const content = await this.extractContent(frame);
      const images = await this.extractImages(frame);

      if (!title && !content) {
        throw new Error('포스트 본문을 추출하지 못했습니다.');
      }

      return {
        url: postUrl,
        title: title || '제목 없음',
        date: date || '날짜 없음',
        content,
        images,
        crawledAt: new Date().toISOString(),
      };
    }, { label: `포스트 크롤링 ${postUrl}` });
  }

  async crawlAll() {
    await this.init();
    try {
      const rawList = await this.getPostList(this.config.maxPages);
      const postList = rawList
        .map((item) => ({
          ...item,
          url: this.normalizePostUrl(item.url),
        }))
        .filter((item) => !!item.url)
        .slice(0, this.config.maxPosts);

      console.log(`
🎯 ${postList.length}개 포스트 크롤링 시작
`);

      for (let i = 0; i < postList.length; i += 1) {
        const postLink = postList[i];
        console.log(`[${i + 1}/${postList.length}] ${postLink.title || postLink.url}`);

        try {
          const postData = await this.crawlPost(postLink.url);
          if (postData) {
            this.posts.push(postData);
            console.log(`✅ 저장 대기: ${postData.title}`);
          }
        } catch (error) {
          console.error(`❌ 포스트 크롤링 실패 (${postLink.url}):`, error.message);
        }

        await sleep(this.config.requestDelayMs + Math.random() * this.config.requestJitterMs);
      }

      console.log(`
✅ 크롤링 완료! 총 ${this.posts.length}개 포스트 수집`);
      return this.posts;
    } finally {
      await this.close();
    }
  }

  async writeFileAtomic(filePath, content) {
    const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  async saveToJson(filename = this.config.outputJson) {
    const safeFilename = resolveSafeRelativePath(filename, 'output-json');
    const outputPath = path.join(process.cwd(), safeFilename);
    const json = JSON.stringify(this.posts, null, 2);
    await this.writeFileAtomic(outputPath, json);
    console.log(`💾 JSON 저장 완료: ${outputPath}`);
  }

  async saveToMarkdown(outputDir = this.config.outputDir) {
    const safeDir = resolveSafeRelativePath(outputDir, 'output-dir');
    const outputPath = path.join(process.cwd(), safeDir);
    await fs.mkdir(outputPath, { recursive: true });

    for (const post of this.posts) {
      const filename = buildMarkdownFilename(post);
      const filepath = path.join(outputPath, filename);
      const markdown = `# ${post.title}\n\n**날짜:** ${post.date}\n**URL:** ${post.url}\n\n---\n\n${post.content}\n\n---\n\n## 이미지\n\n${post.images.map((img, i) => `![이미지 ${i + 1}](${img})`).join('\n\n')}\n\n---\n*크롤링 시간: ${post.crawledAt}*\n`;

      await this.writeFileAtomic(filepath, markdown);
    }

    console.log(`📁 마크다운 파일 저장 완료: ${outputPath}/`);
  }

  async close() {
    if (this.page) {
      await this.page.close({ runBeforeUnload: false }).catch(() => {});
      this.page = null;
    }

    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      console.log('🔚 브라우저 종료');
    }
  }
}

async function main() {
  const config = parseConfig();

  if (config.help) {
    console.log(getUsage());
    return;
  }

  const crawler = new NaverBlogCrawler(config);

  console.log('🎬 네이버 블로그 크롤러 시작\n');
  console.log(`📍 블로그 ID: ${config.blogId}`);
  console.log(`🌐 블로그 URL: https://blog.naver.com/${config.blogId}`);
  console.log(`⚠️  현재 세팅: 최대 ${config.maxPosts}개, 포스트 간 최소 대기 ${config.requestDelayMs}ms (+${config.requestJitterMs}ms)`);

  const posts = await crawler.crawlAll();

  if (posts.length > 0) {
    await crawler.saveToJson(config.outputJson);
    await crawler.saveToMarkdown(config.outputDir);
  }

  if (posts.length === 0) {
    console.warn('⚠️ 수집된 포스트가 없습니다. 네트워크 상태/레이아웃 변경/접근 제한 여부를 확인하세요.');
  }

  console.log('\n🎉 모든 작업 완료!');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('❌ 실행 실패:', error.message);
    process.exit(1);
  });
}

export {
  NaverBlogCrawler,
  resolveSafeRelativePath,
  DEFAULT_CONFIG,
  getUsage,
};
