import { model } from "@medusajs/framework/utils"

export const Post = model.define("post", {
  id: model.id().primaryKey(),
  title: model.text(),
  slug: model.text().unique(),
  content: model.text(),
  excerpt: model.text().nullable(),
  thumbnail: model.text().nullable(),
  
  // 🔥 新增：SEO 與結構化標籤欄位
  seo_title: model.text().nullable(),
  seo_description: model.text().nullable(),
  seo_keywords: model.text().nullable(),
  structured_data: model.text().nullable(), // 為了容納整段 JSON-LD 腳本，這裡使用 text
  
  is_active: model.boolean().default(true),
})