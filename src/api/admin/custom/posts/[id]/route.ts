import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// 取得單篇文章 (供編輯時帶入舊資料)
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const newsModuleService = req.scope.resolve("news") as any
  try {
    const post = await newsModuleService.retrievePost(req.params.id as string)
    res.status(200).json({ post })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}

// 更新文章
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const newsModuleService = req.scope.resolve("news") as any
  const body = req.body as any
  const id = req.params.id as string;

  // 🚨 終極監視器 2 號：印出修改時 Admin 傳來的完整資料
  console.log(`\n===========================================`);
  console.log(`🚨 [後端 API 監視器 - 修改 PUT] 收到來自後台 Admin 的 Payload (ID: ${id}):`);
  console.log(JSON.stringify(body, null, 2));
  console.log(`===========================================\n`);
  
  try {
    // 🔥 明確綁定更新欄位，確保修改時能蓋掉舊的多語系資料
    const updatedPosts = await newsModuleService.updatePosts([{
      id: id,
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
    }]);

    // updatePosts 回傳的通常是陣列，我們取第一筆
    const post = Array.isArray(updatedPosts) ? updatedPosts[0] : updatedPosts;
    
    res.status(200).json({ post })
  } catch (error: any) {
    console.error("❌ 更新文章失敗:", error);
    res.status(400).json({ message: error.message || "更新失敗" })
  }
}

// 刪除文章
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const newsModuleService = req.scope.resolve("news") as any
  try {
    await newsModuleService.deletePosts(req.params.id as string)
    res.status(200).json({ success: true })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}