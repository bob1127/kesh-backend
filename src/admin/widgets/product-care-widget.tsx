import { defineWidgetConfig } from "@medusajs/admin-sdk";
import {
  Container,
  Heading,
  Button,
  Tabs,
  Label,
  Textarea,
  toast,
} from "@medusajs/ui";
import { useState, useEffect } from "react";

const ProductCareWidget = ({ data }: { data: any }) => {
  const product = data;

  // 讀取三個語系的保養建議
  const [careZh, setCareZh] = useState("");
  const [careEn, setCareEn] = useState("");
  const [careKo, setCareKo] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 當商品資料載入時，將 metadata 的資料寫入輸入框
  useEffect(() => {
    if (product?.metadata) {
      setCareZh(product.metadata.care_zh || "");
      setCareEn(product.metadata.care_en || "");
      setCareKo(product.metadata.care_ko || "");
    }
  }, [product]);

  const handleSave = async () => {
    if (!product?.id) return;
    setIsLoading(true);

    try {
      // ⚠️ 非常重要：一定要把原本的 metadata 展開包進來，才不會洗掉 SEO 和翻譯的資料
      const newMetadata = {
        ...(product.metadata || {}),
        care_zh: careZh,
        care_en: careEn,
        care_ko: careKo,
      };

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

      if (!res.ok) {
        throw new Error("更新失敗");
      }

      toast.success("保養建議已成功寫入資料庫！");

      // 儲存成功後刷新畫面
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      toast.error("無法儲存保養建議", {
        description: error.message,
      });
      console.error("保養建議儲存錯誤:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!product) return null;

  return (
    <Container className="p-6 mt-4 border border-gray-200 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Heading level="h2" className="text-xl">
            清潔與保養建議
          </Heading>
          <p className="text-xs text-gray-500 mt-1">
            提供客戶關於商品材質的維護與保養須知。
          </p>
        </div>
        <Button variant="secondary" onClick={handleSave} isLoading={isLoading}>
          儲存保養建議
        </Button>
      </div>

      <Tabs defaultValue="zh">
        <Tabs.List className="mb-4">
          <Tabs.Trigger value="zh">🇹🇼 中文</Tabs.Trigger>
          <Tabs.Trigger value="en">🇺🇸 English</Tabs.Trigger>
          <Tabs.Trigger value="ko">🇰🇷 한국어</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="zh" className="pt-2">
          <Label className="mb-2 block font-bold text-gray-700">
            中文保養建議
          </Label>
          <Textarea
            value={careZh}
            onChange={(e) => setCareZh(e.target.value)}
            className="min-h-[100px]"
            placeholder="例如：請使用軟布輕輕擦拭，避免接觸香水、化妝品與化學溶劑..."
          />
        </Tabs.Content>

        <Tabs.Content value="en" className="pt-2">
          <Label className="mb-2 block font-bold text-gray-700">
            英文保養建議 (Care Instructions)
          </Label>
          <Textarea
            value={careEn}
            onChange={(e) => setCareEn(e.target.value)}
            className="min-h-[100px]"
            placeholder="e.g. Wipe gently with a soft cloth. Avoid contact with perfumes and cosmetics..."
          />
        </Tabs.Content>

        <Tabs.Content value="ko" className="pt-2">
          <Label className="mb-2 block font-bold text-gray-700">
            韓文保養建議 (취급 시 주의사항)
          </Label>
          <Textarea
            value={careKo}
            onChange={(e) => setCareKo(e.target.value)}
            className="min-h-[100px]"
            placeholder="부드러운 천으로 닦아주세요. 향수나 화장품과의 접촉을 피하십시오..."
          />
        </Tabs.Content>
      </Tabs>
    </Container>
  );
};

// 讓它顯示在商品頁面的最下方
export const config = defineWidgetConfig({
  zone: "product.details.after",
});

export default ProductCareWidget;
