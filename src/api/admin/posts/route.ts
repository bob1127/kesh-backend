import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

// 新增文章
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const data = req.body; 
  const newsModuleService = req.scope.resolve("news") as any;
  
  try {
    const post = await newsModuleService.createPosts(data);
    return res.status(200).json({ success: true, post });
  } catch (error: any) {
    console.error("建立文章失敗:", error);
    return res.status(400).json({ message: error.message || "建立失敗" });
  }
}

// 取得文章列表
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const newsModuleService = req.scope.resolve("news") as any;

  try {
    const posts = await newsModuleService.listPosts();
    return res.status(200).json({ posts });
  } catch (error: any) {
    console.error("讀取文章列表失敗:", error);
    return res.status(400).json({ message: error.message || "讀取失敗" });
  }
}