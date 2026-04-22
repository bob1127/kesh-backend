import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const newsModuleService = req.scope.resolve("news") as any
  try {
    // 直接抓取全部欄位，避免 TypeScript 檢查欄位名稱
    const posts = await newsModuleService.listPosts({})
    posts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    res.status(200).json({ posts })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const newsModuleService = req.scope.resolve("news") as any
  try {
    const post = await newsModuleService.createPosts(req.body as any)
    res.status(200).json({ post })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}