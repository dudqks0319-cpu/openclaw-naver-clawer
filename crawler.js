import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

class NaverBlogCrawler {
  constructor(blogId) {
    this.blogId = blogId;
    this.baseUrl = `https://blog.naver.com/${blogId}`;
    this.posts = [];
    this.browser = null;
    this.page = null;
  }

  async init() {
    console.log('🚀 브라우저 시작...');
    this.browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    this.page = await context.newPage();
  }

  async getPostList(maxPages = 5) {
    console.log(`📚 블로그 목록 수집 시작: ${this.baseUrl}`);
    
    try {
      // 블로그 메인 페이지로 이동
      await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(2000);

      // iframe으로 전환 (네이버 블로그는 iframe 사용)
      const frames = this.page.frames();
      let mainFrame = frames.find(f => f.url().includes('PostList'));
      
      if (!mainFrame) {
        // PostList가 없으면 메인 프레임 찾기
        mainFrame = frames.find(f => f.url().includes(this.blogId));
      }

      if (!mainFrame) {
        console.log('❌ 블로그 프레임을 찾을 수 없습니다.');
        return [];
      }

      console.log(`✅ 프레임 발견: ${mainFrame.url()}`);

      // 포스트 링크 수집
      const postLinks = await mainFrame.$$eval('a', (links) => 
        links
          .map(link => ({
            url: link.href,
            title: link.textContent.trim()
          }))
          .filter(item => item.url.includes('/PostView.naver') || item.url.includes('/PostView.nhn'))
      );

      console.log(`📝 발견된 포스트 수: ${postLinks.length}`);
      
      // 중복 제거
      const uniquePosts = Array.from(
        new Map(postLinks.map(item => [item.url, item])).values()
      );

      return uniquePosts.slice(0, maxPages * 10); // 페이지당 약 10개씩

    } catch (error) {
      console.error('❌ 포스트 목록 수집 중 오류:', error.message);
      return [];
    }
  }

  async crawlPost(postUrl) {
    try {
      console.log(`📖 포스트 크롤링: ${postUrl}`);
      
      await this.page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await this.page.waitForTimeout(2000);

      // iframe에서 본문 추출
      const frames = this.page.frames();
      const mainFrame = frames.find(f => 
        f.url().includes('PostView') || 
        f.url().includes(this.blogId)
      );

      if (!mainFrame) {
        console.log('❌ 포스트 프레임을 찾을 수 없습니다.');
        return null;
      }

      // 제목 추출
      const title = await mainFrame.$eval(
        '.se-title-text, .pcol1, h3.se_textarea',
        el => el.textContent.trim()
      ).catch(() => '제목 없음');

      // 날짜 추출
      const date = await mainFrame.$eval(
        '.se_publishDate, .blog2_series, .se-date',
        el => el.textContent.trim()
      ).catch(() => '날짜 없음');

      // 본문 추출
      const content = await mainFrame.$$eval(
        '.se-main-container p, .se-text-paragraph, .se_component_wrap, .post-view',
        elements => elements.map(el => el.textContent.trim()).join('\n\n')
      ).catch(() => '');

      // 이미지 URL 추출
      const images = await mainFrame.$$eval(
        'img.se-image-resource, img.__se_img_el',
        imgs => imgs.map(img => img.src)
      ).catch(() => []);

      const postData = {
        url: postUrl,
        title,
        date,
        content: content.substring(0, 5000), // 최대 5000자
        images: images.slice(0, 10), // 최대 10개 이미지
        crawledAt: new Date().toISOString()
      };

      console.log(`✅ 크롤링 완료: ${title}`);
      return postData;

    } catch (error) {
      console.error(`❌ 포스트 크롤링 실패 (${postUrl}):`, error.message);
      return null;
    }
  }

  async crawlAll(maxPosts = 10) {
    await this.init();

    try {
      // 1. 포스트 목록 가져오기
      const postList = await this.getPostList();
      console.log(`\n📊 총 ${postList.length}개 포스트 발견`);
      
      const postsToProcess = postList.slice(0, maxPosts);
      console.log(`🎯 ${postsToProcess.length}개 포스트 크롤링 시작\n`);

      // 2. 각 포스트 크롤링
      for (let i = 0; i < postsToProcess.length; i++) {
        const postLink = postsToProcess[i];
        console.log(`[${i + 1}/${postsToProcess.length}] ${postLink.title || postLink.url}`);
        
        const postData = await this.crawlPost(postLink.url);
        if (postData) {
          this.posts.push(postData);
        }
        
        // 요청 간격 (1-2초)
        await this.page.waitForTimeout(1000 + Math.random() * 1000);
      }

      console.log(`\n✅ 크롤링 완료! 총 ${this.posts.length}개 포스트 수집`);

    } catch (error) {
      console.error('❌ 크롤링 중 오류 발생:', error);
    } finally {
      await this.close();
    }

    return this.posts;
  }

  async saveToJson(filename = 'posts.json') {
    const outputPath = path.join(process.cwd(), filename);
    await fs.writeFile(
      outputPath,
      JSON.stringify(this.posts, null, 2),
      'utf-8'
    );
    console.log(`💾 저장 완료: ${outputPath}`);
  }

  async saveToMarkdown(outputDir = 'posts') {
    await fs.mkdir(outputDir, { recursive: true });

    for (const post of this.posts) {
      const filename = `${post.date.replace(/[^0-9]/g, '')}_${post.title.substring(0, 30).replace(/[^a-zA-Z0-9가-힣]/g, '_')}.md`;
      const filepath = path.join(outputDir, filename);

      const markdown = `# ${post.title}

**날짜:** ${post.date}
**URL:** ${post.url}

---

${post.content}

---

## 이미지

${post.images.map((img, i) => `![이미지 ${i + 1}](${img})`).join('\n\n')}

---
*크롤링 시간: ${post.crawledAt}*
`;

      await fs.writeFile(filepath, markdown, 'utf-8');
    }

    console.log(`📁 마크다운 파일 저장 완료: ${outputDir}/`);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔚 브라우저 종료');
    }
  }
}

// 실행
async function main() {
  const blogId = 'pjt3591oo'; // 멍개의 연구소
  const crawler = new NaverBlogCrawler(blogId);

  console.log('🎬 네이버 블로그 크롤러 시작\n');
  console.log(`📍 블로그 ID: ${blogId}`);
  console.log(`🌐 블로그 URL: https://blog.naver.com/${blogId}\n`);

  const posts = await crawler.crawlAll(10); // 최대 10개 포스트

  if (posts.length > 0) {
    await crawler.saveToJson('naver_blog_posts.json');
    await crawler.saveToMarkdown('posts');
  }

  console.log('\n🎉 모든 작업 완료!');
  process.exit(0);
}

main().catch(console.error);
