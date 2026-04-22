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
  try {
    const id = req.params.id as string;
    const updateData = req.body as any;

    // 🔥 避開預設方法的雷點：在 V2 中，更新資料最好直接傳入包含 ID 的物件陣列
    const updatedPosts = await newsModuleService.updatePosts([{
      id: id,
      ...updateData
    }]);

    // updatePosts 回傳的通常是陣列，我們取第一筆
    const post = Array.isArray(updatedPosts) ? updatedPosts[0] : updatedPosts;
    
    res.status(200).json({ post })
  } catch (error: any) {
    console.error("更新文章失敗:", error);
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