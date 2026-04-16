import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // 接收後台傳來的文章資料
  const data = req.body; 
  const query = req.scope.resolve("query");
  
  // 這裡呼叫底層寫入資料庫 (簡化範例)
  // 實務上需透過 Workflow 或 Service 寫入
  console.log("準備儲存文章:", data);
  
  return res.status(200).json({ success: true });
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // 列出所有文章給後台看
  return res.status(200).json({ posts: [] });
}