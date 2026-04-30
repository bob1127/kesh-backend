import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260430044521 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "post" add column if not exists "title_en" text null, add column if not exists "excerpt_en" text null, add column if not exists "content_en" text null, add column if not exists "seo_title_en" text null, add column if not exists "seo_description_en" text null, add column if not exists "seo_keywords_en" text null, add column if not exists "structured_data_en" text null, add column if not exists "title_ko" text null, add column if not exists "excerpt_ko" text null, add column if not exists "content_ko" text null, add column if not exists "seo_title_ko" text null, add column if not exists "seo_description_ko" text null, add column if not exists "seo_keywords_ko" text null, add column if not exists "structured_data_ko" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "post" drop column if exists "title_en", drop column if exists "excerpt_en", drop column if exists "content_en", drop column if exists "seo_title_en", drop column if exists "seo_description_en", drop column if exists "seo_keywords_en", drop column if exists "structured_data_en", drop column if exists "title_ko", drop column if exists "excerpt_ko", drop column if exists "content_ko", drop column if exists "seo_title_ko", drop column if exists "seo_description_ko", drop column if exists "seo_keywords_ko", drop column if exists "structured_data_ko";`);
  }

}
