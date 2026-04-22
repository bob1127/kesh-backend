import { MedusaService } from "@medusajs/framework/utils"
import { Post } from "./models/post"

// 讓 Medusa 自動幫我們把 CRUD 的功能全部生成出來
class NewsModuleService extends MedusaService({
  Post,
}) {}

export default NewsModuleService