import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

// 讀取：從 Store 的 Metadata 抓取
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const storeModule = req.scope.resolve(Modules.STORE);
    const stores = await storeModule.listStores();
    
    if (!stores || stores.length === 0) {
      return res.json({ slides: [] });
    }

    const slides = stores[0].metadata?.hero_slides || [];
    return res.json({ slides });
  } catch (error) {
    return res.status(500).json({ error: "讀取失敗" });
  }
}

// 儲存：寫入 PostgreSQL 資料庫
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const storeModule = req.scope.resolve(Modules.STORE);
    const stores = await storeModule.listStores();
    
    if (!stores || stores.length === 0) {
      return res.status(400).json({ message: "找不到商店" });
    }

    const { slides } = req.body as { slides: any[] };

    // 🔥 核心修復：使用 ID + 物件 雙參數寫法，並用 as any 繞過型別紅線
    await (storeModule as any).updateStores(stores[0].id, {
      metadata: {
        ...(stores[0].metadata as Record<string, unknown> || {}),
        hero_slides: slides,
      },
    });

    return res.json({ success: true, slides });
  } catch (error) {
    console.error("儲存失敗:", error);
    return res.status(500).json({ error: "儲存失敗" });
  }
}