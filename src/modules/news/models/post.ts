import { model } from "@medusajs/framework/utils"

export const Post = model.define("post", {
  id: model.id().primaryKey(),
  slug: model.text().unique(),
  
  // 繁體中文
  title: model.text(),
  excerpt: model.text().nullable(),
  content: model.text(),
  seo_title: model.text().nullable(),
  seo_description: model.text().nullable(),
  seo_keywords: model.text().nullable(),
  structured_data: model.text().nullable(),

  // 英文 (EN)
  title_en: model.text().nullable(),
  excerpt_en: model.text().nullable(),
  content_en: model.text().nullable(),
  seo_title_en: model.text().nullable(),
  seo_description_en: model.text().nullable(),
  seo_keywords_en: model.text().nullable(),
  structured_data_en: model.text().nullable(),

  // 韓文 (KO)
  title_ko: model.text().nullable(),
  excerpt_ko: model.text().nullable(),
  content_ko: model.text().nullable(),
  seo_title_ko: model.text().nullable(),
  seo_description_ko: model.text().nullable(),
  seo_keywords_ko: model.text().nullable(),
  structured_data_ko: model.text().nullable(),

  thumbnail: model.text().nullable(),
  is_active: model.boolean().default(true),
})