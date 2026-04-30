import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const newsModuleService = req.scope.resolve("news") as any
  
  try {
    // 取得所有「已發布」的文章 (is_active: true)
    const posts = await newsModuleService.listPosts({
      is_active: true
    })

    // 🚨 終極監視器 3 號：檢查資料庫拿出來的資料到底有沒有 _ko 欄位！
    if (posts.length > 0) {
      console.log(`\n===========================================`);
      console.log(`🚨 [前台 GET API 監視器] 從資料庫撈出的文章資料:`);
      // 只印出第一篇，確認欄位有沒有長出來
      console.log(JSON.stringify(posts[0], null, 2));
      console.log(`===========================================\n`);
    }

    // 依照建立時間反向排序 (最新的文章排在最前面)
    posts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    res.status(200).json({ posts })
  } catch (error: any) {
    console.error("前台抓取文章失敗:", error)
    res.status(400).json({ message: error.message })
  }
}