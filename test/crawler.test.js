import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseArgs,
  parseConfig,
  sanitizeForFilename,
  resolveSafeRelativePath,
  buildMarkdownFilename,
} from '../crawler.js';

test('parseArgs supports --key value and --key=value', () => {
  const parsed = parseArgs(['--blog-id', 'demo', '--max-posts=7', '--headless=false']);

  assert.equal(parsed['blog-id'], 'demo');
  assert.equal(parsed['max-posts'], '7');
  assert.equal(parsed.headless, 'false');
});

test('parseConfig applies CLI values over env defaults', () => {
  const cfg = parseConfig(
    ['--blog-id', 'cli-blog', '--max-posts', '3'],
    {
      NAVER_BLOG_ID: 'env-blog',
      NAVER_MAX_POSTS: '9',
      NAVER_OUTPUT_JSON: 'safe.json',
      NAVER_OUTPUT_DIR: 'safe-dir',
      NAVER_MAX_RETRIES: '5',
    },
  );

  assert.equal(cfg.blogId, 'cli-blog');
  assert.equal(cfg.maxPosts, 3);
  assert.equal(cfg.maxPages, 5);
  assert.equal(cfg.outputJson, 'safe.json');
  assert.equal(cfg.outputDir, 'safe-dir');
});

test('parseConfig falls back to environment when CLI is omitted', () => {
  const cfg = parseConfig([], {
    NAVER_BLOG_ID: 'env-blog',
    NAVER_MAX_POSTS: '12',
    NAVER_MAX_PAGES: '8',
    NAVER_REQUEST_DELAY_MS: '2100',
    NAVER_REQUEST_JITTER_MS: '500',
    NAVER_HEADLESS: 'false',
  });

  assert.equal(cfg.blogId, 'env-blog');
  assert.equal(cfg.maxPosts, 12);
  assert.equal(cfg.maxPages, 8);
  assert.equal(cfg.requestDelayMs, 2100);
  assert.equal(cfg.requestJitterMs, 500);
  assert.equal(cfg.headless, false);
});

test('resolveSafeRelativePath blocks traversal and absolute paths', () => {
  assert.throws(() => resolveSafeRelativePath('../outside', 'output'), /Path traversal/);
  assert.throws(() => resolveSafeRelativePath('/tmp/outside', 'output'), /Unsafe/);
  assert.equal(resolveSafeRelativePath('data/exports/latest.json'), 'data/exports/latest.json');
});

test('sanitizeForFilename returns deterministic safe filenames', () => {
  const value = '  안 녕:하@요/테*스트?  ';
  const sanitized = sanitizeForFilename(value, 40);

  assert.ok(!/[<>:"/\\|?*]/.test(sanitized));
  assert.ok(sanitized.length <= 40);
});

test('buildMarkdownFilename is stable and has .md extension', () => {
  const first = buildMarkdownFilename({
    date: '2026.04.02.',
    title: '테스트/제목:안전',
    url: 'https://blog.naver.com/pjt3591oo/123',
  });

  const second = buildMarkdownFilename({
    date: '2026.04.02.',
    title: '테스트/제목:안전',
    url: 'https://blog.naver.com/pjt3591oo/123',
  });

  assert.equal(first, second);
  assert.ok(first.endsWith('.md'));
});
