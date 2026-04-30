import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// 取得文章列表
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const newsModuleService = req.scope.resolve("news") as any
  try {
    const posts = await newsModuleService.listPosts({})
    posts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    res.status(200).json({ posts })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}

// 新增文章
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const newsModuleService = req.scope.resolve("news") as any
  const body = req.body as any

  // 🚨 終極監視器 1 號：印出新增時 Admin 傳來的完整資料
  console.log(`\n===========================================`);
  console.log(`🚨 [後端 API 監視器 - 新增 POST] 收到來自後台 Admin 的 Payload:`);
  console.log(JSON.stringify(body, null, 2));
  console.log(`===========================================\n`);

  try {
    // 🔥 明確綁定所有欄位，確保多語系資料完整存入
    const post = await newsModuleService.createPosts({
      title: body.title,
      slug: body.slug,
      excerpt: body.excerpt,
      content: body.content,
      thumbnail: body.thumbnail,
      is_active: body.is_active,

      // --- 英文 (EN) ---
      title_en: body.title_en,
      excerpt_en: body.excerpt_en,
      content_en: body.content_en,
      seo_title_en: body.seo_title_en,
      seo_description_en: body.seo_description_en,
      seo_keywords_en: body.seo_keywords_en,
      structured_data_en: body.structured_data_en,

      // --- 韓文 (KO) ---
      title_ko: body.title_ko,
      excerpt_ko: body.excerpt_ko,
      content_ko: body.content_ko,
      seo_title_ko: body.seo_title_ko,
      seo_description_ko: body.seo_description_ko,
      seo_keywords_ko: body.seo_keywords_ko,
      structured_data_ko: body.structured_data_ko,

      // --- SEO 中文 ---
      seo_title: body.seo_title,
      seo_description: body.seo_description,
      seo_keywords: body.seo_keywords,
      structured_data: body.structured_data,
    })

    res.status(200).json({ post })
  } catch (error: any) {
    console.error("❌ 新增文章失敗:", error);
    res.status(400).json({ message: error.message })
  }
}