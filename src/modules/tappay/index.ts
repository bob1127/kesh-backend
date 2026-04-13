import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import TappayService from "./service"

// 🔥 Medusa v2 官方唯一指定匯出格式
export default ModuleProvider(Modules.PAYMENT, {
  services: [TappayService],
})