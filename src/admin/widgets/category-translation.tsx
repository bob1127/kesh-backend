import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Input, Button, Label, toast } from "@medusajs/ui";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const CategoryTranslationWidget = ({ data: category }: { data: any }) => {
  const queryClient = useQueryClient();

  const [en, setEn] = useState("");
  const [ko, setKo] = useState("");
  const [loading, setLoading] = useState(false);

  // 🛡️ 防呆與同步：不管 metadata 是否為空，都確保狀態能正確吃進去
  useEffect(() => {
    if (category) {
      setEn(category.metadata?.title_en || "");
      setKo(category.metadata?.title_ko || "");
    }
  }, [category]);

  const handleSave = async () => {
    if (!category?.id) return;
    setLoading(true);

    try {
      const res = await fetch(`/admin/product-categories/${category.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // 🔥 核心關鍵 1：連同 name 一起送出！
          // 強迫資料庫 (MikroORM) 承認這是一次有效的更新，徹底解決只更新 metadata 被無視的 Bug。
          name: category.name,
          metadata: {
            ...(category.metadata || {}), // 避免 metadata 為 null 時報錯
            title_en: en,
            title_ko: ko,
          },
        }),
      });

      if (res.ok) {
        // 🔥 核心關鍵 2：徹底清除「列表」與「當前單一分類」的快取
        await queryClient.invalidateQueries({
          queryKey: ["product_categories"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["product_category", category.id],
        });

        toast.success("翻譯已永久儲存至資料庫！");
      } else {
        const errorData = await res.json();
        toast.error(`儲存失敗: ${errorData.message || "未知錯誤"}`);
      }
    } catch (err) {
      toast.error("連線後端失敗，請檢查網路");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="p-6 mt-4 shadow-sm border border-ui-border-base">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xl">🌍</span>
        <Heading level="h2">國際化名稱設定</Heading>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="space-y-2">
          <Label className="text-ui-fg-subtle font-medium">英文標題 (EN)</Label>
          <Input
            value={en}
            onChange={(e) => setEn(e.target.value)}
            placeholder="例如: Small Leather Goods"
            className="bg-ui-bg-field"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-ui-fg-subtle font-medium">韓文標題 (KO)</Label>
          <Input
            value={ko}
            onChange={(e) => setKo(e.target.value)}
            placeholder="例如: 스몰 레더"
            className="bg-ui-bg-field"
          />
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-ui-border-base">
        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={loading}
          className="min-w-[100px]"
        >
          儲存變更
        </Button>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product_category.details.after",
});

export default CategoryTranslationWidget;
