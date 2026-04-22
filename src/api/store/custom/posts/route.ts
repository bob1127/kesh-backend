import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const newsModuleService = req.scope.resolve("news") as any
  
  try {
    // 取得所有「已發布」的文章 (is_active: true)
    const posts = await newsModuleService.listPosts({
      is_active: true
    })

    // 依照建立時間反向排序 (最新的文章排在最前面)
    posts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    res.status(200).json({ posts })
  } catch (error: any) {
    console.error("前台抓取文章失敗:", error)
    res.status(400).json({ message: error.message })
  }
}