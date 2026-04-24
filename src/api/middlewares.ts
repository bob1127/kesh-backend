import { defineMiddlewares } from "@medusajs/medusa";

export default defineMiddlewares({
  routes: [
    {
      // 瞄準我們儲存圖片的 API
      matcher: "/admin/custom/hero-slides",
      
      // 🔥 終極解法：直接告訴 Medusa 內建的 Body Parser，把這支 API 的容量限制開到 50MB！
      bodyParser: {
        sizeLimit: "50mb",
      },
      
      middlewares: [],
    },
  ],
});