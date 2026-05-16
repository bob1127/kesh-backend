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

const ProductReportWidget = ({ data }: { data: any }) => {
  const product = data;

  // 讀取三個語系的品況報告
  const [reportZh, setReportZh] = useState("");
  const [reportEn, setReportEn] = useState("");
  const [reportKo, setReportKo] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 當商品資料載入時，將 metadata 的資料寫入輸入框
  useEffect(() => {
    if (product?.metadata) {
      setReportZh(product.metadata.report_zh || "");
      setReportEn(product.metadata.report_en || "");
      setReportKo(product.metadata.report_ko || "");
    }
  }, [product]);

  const handleSave = async () => {
    if (!product?.id) return;
    setIsLoading(true);

    try {
      // ⚠️ 非常重要：一定要把原本的 metadata 展開包進來，才不會洗掉 SEO、翻譯和保養須知的資料
      const newMetadata = {
        ...(product.metadata || {}),
        report_zh: reportZh,
        report_en: reportEn,
        report_ko: reportKo,
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

      toast.success("品況報告已成功寫入資料庫！");

      // 儲存成功後刷新畫面
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      toast.error("無法儲存品況報告", {
        description: error.message,
      });
      console.error("品況報告儲存錯誤:", error);
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
            品況報告
          </Heading>
          <p className="text-xs text-gray-500 mt-1">
            提供客戶關於商品目前的詳細品況說明與瑕疵備註。
          </p>
        </div>
        <Button variant="secondary" onClick={handleSave} isLoading={isLoading}>
          儲存品況報告
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
            中文品況報告
          </Label>
          <Textarea
            value={reportZh}
            onChange={(e) => setReportZh(e.target.value)}
            className="min-h-[100px]"
            placeholder="例如：整體保存良好，僅四角有輕微使用痕跡，五金有正常氧化現象..."
          />
        </Tabs.Content>

        <Tabs.Content value="en" className="pt-2">
          <Label className="mb-2 block font-bold text-gray-700">
            英文品況報告 (Condition Report)
          </Label>
          <Textarea
            value={reportEn}
            onChange={(e) => setReportEn(e.target.value)}
            className="min-h-[100px]"
            placeholder="e.g. Excellent condition. Minor wear on the corners, normal oxidation on hardware..."
          />
        </Tabs.Content>

        <Tabs.Content value="ko" className="pt-2">
          <Label className="mb-2 block font-bold text-gray-700">
            韓文品況報告 (상태 보고서)
          </Label>
          <Textarea
            value={reportKo}
            onChange={(e) => setReportKo(e.target.value)}
            className="min-h-[100px]"
            placeholder="전체적으로 좋은 상태입니다. 모서리에 약간의 사용감이 있으며, 금속 장식에 정상적인 산화가 있습니다..."
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

export default ProductReportWidget;
