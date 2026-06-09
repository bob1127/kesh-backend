import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { R2FileService } from "./service"

export default ModuleProvider(Modules.FILE, {
  services: [R2FileService],
})
