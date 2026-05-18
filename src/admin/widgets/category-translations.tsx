import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Button, Input, Label, toast } from "@medusajs/ui";
import { useState } from "react";

// Widget 會自動接收當前頁面的分類資料 (productCategory)
const CategoryTranslationWidget = ({ productCategory }: any) => {
  // 初始化 State，讀取已存在的翻譯（如果有的話）
  const [nameEn, setNameEn] = useState(
    productCategory?.metadata?.name_en || "",
  );
  const [nameKo, setNameKo] = useState(
    productCategory?.metadata?.name_ko || "",
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // 保留原本的 metadata，只更新英文與韓文名稱
      const newMetadata = {
        ...(productCategory.metadata || {}),
        name_en: nameEn,
        name_ko: nameKo,
      };

      const res = await fetch(
        `/admin/product-categories/${productCategory.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadata: newMetadata }),
        },
      );

      if (res.ok) {
        toast.success("翻譯已更新！", {
          description: "中、英、韓文名稱已成功儲存，前台將立即生效。",
        });
      } else {
        throw new Error("更新失敗");
      }
    } catch (error) {
      toast.error("儲存失敗", {
        description: "無法更新翻譯資料，請稍後再試。",
      });
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container className="p-6 mt-4 shadow-sm border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Heading level="h2" className="text-xl font-bold">
            🌐 多語系翻譯 (中繼資料)
          </Heading>
          <p className="text-xs text-gray-500 mt-1">
            在此設定的名稱將會自動覆蓋前台 Navbar 與側邊欄對應語系的顯示文字。
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={isLoading}
          className="bg-black text-white hover:bg-gray-800"
        >
          儲存翻譯
        </Button>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label className="font-bold text-gray-700">英文名稱 (English)</Label>
          <Input
            placeholder="例如: Small Leather Goods"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className="bg-gray-50"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label className="font-bold text-gray-700">韓文名稱 (Korean)</Label>
          <Input
            placeholder="例如: 소형 가죽 제품"
            value={nameKo}
            onChange={(e) => setNameKo(e.target.value)}
            className="bg-gray-50"
          />
        </div>
      </div>
    </Container>
  );
};

// 告訴 Medusa 把這個區塊「注入」到產品分類詳細頁面的「最下方」
export const config = defineWidgetConfig({
  zone: "product_category.details.after",
});

export default CategoryTranslationWidget;
