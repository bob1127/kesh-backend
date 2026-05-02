import { defineWidgetConfig } from "@medusajs/admin-sdk";
import {
  Container,
  Heading,
  Input,
  Textarea,
  Button,
  toast,
} from "@medusajs/ui";
import { useState, useEffect } from "react";

const ProductSeoWidget = ({ data }: { data: any }) => {
  const product = data;

  const [seoTitle, setSeoTitle] = useState("");
  const [seoDesc, setSeoDesc] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (product?.metadata) {
      setSeoTitle(product.metadata.seo_title || "");
      setSeoDesc(product.metadata.seo_description || "");
      setSeoKeywords(product.metadata.seo_keywords || "");
    } else {
      setSeoTitle("");
      setSeoDesc("");
      setSeoKeywords("");
    }
  }, [product]);

  const handleSave = async () => {
    if (!product?.id) return;
    setIsLoading(true);

    try {
      // 確保將輸入框的最新狀態組裝好
      const newMetadata = {
        ...(product.metadata || {}),
        seo_title: seoTitle,
        seo_description: seoDesc,
        seo_keywords: seoKeywords,
      };

      console.log("🚀 [SEO Widget] 準備送出的 Payload:", {
        metadata: newMetadata,
      });

      const res = await fetch(`/admin/products/${product.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          metadata: newMetadata,
        }),
      });

      const text = await res.text();
      let resData;
      try {
        resData = JSON.parse(text);
      } catch (e) {
        throw new Error("伺服器回傳格式錯誤，請確認是否被登出");
      }

      if (!res.ok) {
        throw new Error(resData?.message || "更新失敗");
      }

      console.log("✅ [SEO Widget] 伺服器回傳的最新資料:", resData);

      toast.success("SEO 設定已成功寫入資料庫！");

      // 🔥 終極殺招：強制刷新網頁！
      // 這樣可以打破 React Query 的舊快取，逼迫畫面重新向資料庫要最新的資料
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      toast.error("無法儲存 SEO 設定", {
        description: error.message,
      });
      console.error("SEO 儲存錯誤:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!product) return null;

  return (
    <Container className="p-6">
      <div className="flex flex-col gap-6">
        <Heading level="h2">SEO 設定 (搜尋引擎優化)</Heading>

        <div className="flex flex-col gap-2">
          <label className="text-ui-fg-subtle text-small-plus font-semibold">
            SEO 標題 (Title)
          </label>
          <Input
            placeholder="例如：【9成新】BOY CHANEL WOC 經典菱格牛皮 | KÉSH de¹"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-ui-fg-subtle text-small-plus font-semibold">
            SEO 描述 (Description)
          </label>
          <Textarea
            placeholder="用一句話描述這個商品，長度建議在 150 字以內..."
            value={seoDesc}
            onChange={(e) => setSeoDesc(e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-ui-fg-subtle text-small-plus font-semibold">
            SEO 關鍵字 (Keywords)
          </label>
          <Input
            placeholder="例如：CHANEL, BOY CHANEL, WOC, 二手香奈兒, 名牌包"
            value={seoKeywords}
            onChange={(e) => setSeoKeywords(e.target.value)}
          />
        </div>

        <div className="flex justify-end mt-4">
          <Button
            variant="primary"
            size="small"
            onClick={handleSave}
            isLoading={isLoading}
          >
            儲存 SEO 設定
          </Button>
        </div>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.details.after",
});

export default ProductSeoWidget;
