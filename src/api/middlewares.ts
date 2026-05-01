import { defineMiddlewares } from "@medusajs/medusa"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"

// 準備一個記憶體鎖頭 (Set)，用來記錄正在儲存中的狀態
const heroSlideLock = new Set<string>()

export default defineMiddlewares({
  routes: [
    {
      // 瞄準我們儲存首頁輪播圖片的 API
      matcher: "/admin/custom/hero-slides",
      
      // 🔥 保留你原本的設定：把這支 API 的容量限制開到 50MB！
      bodyParser: {
        sizeLimit: "50mb",
      },
      
      middlewares: [
        (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
          // 💡 安全機制：我們只攔截 POST 或 PUT (寫入/上傳資料) 的動作，GET 讀取圖片不該被擋
          if (req.method !== "POST" && req.method !== "PUT") {
            return next();
          }

          // 設定一把專屬的鎖頭鑰匙
          const lockKey = "saving-hero-slide";

          // 🚨 核心防護：如果鎖頭已經存在，代表是 5 秒內的重複連點！
          if (heroSlideLock.has(lockKey)) {
            console.warn(`🛡️ [防護盾觸發] 攔截到 5 秒內的重複點擊儲存 Hero Slides！`);
            // 回傳 429 狀態碼，拒絕這次的重複上傳
            return res.status(429).json({ 
              message: "系統正在處理大量圖片中，請勿在 5 秒內重複點擊儲存！" 
            });
          }

          // 🔒 上鎖：把這把鑰匙加進鎖頭裡
          heroSlideLock.add(lockKey);

          // ⏱️ 5 秒後自動解鎖 (5000 毫秒)
          setTimeout(() => {
            heroSlideLock.delete(lockKey);
          }, 5000);

          // 放行，讓 Medusa 繼續去處理 50MB 的圖片儲存
          next();
        }
      ],
    },
  ],
});