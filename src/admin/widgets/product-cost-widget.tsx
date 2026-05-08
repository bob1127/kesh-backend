import { defineWidgetConfig } from "@medusajs/admin-sdk";
import {
  Container,
  Heading,
  Text,
  Input,
  Button,
  clx,
  toast,
} from "@medusajs/ui";
import { useState, useEffect } from "react";

const ProductCostWidget = ({ data }: { data: any }) => {
  const product = data;

  const [cost, setCost] = useState<number | string>("");
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 1. 讀取並設定初始成本
    if (product?.metadata?.cost) {
      setCost(Number(product.metadata.cost));
    }

    // 2. 🛡️ 安全地在背景抓取「完整商品價格」 (避免使用容易崩潰的 hook)
    const fetchPrice = async () => {
      if (!product?.id) return;
      try {
        const res = await fetch(`/admin/products/${product.id}`, {
          credentials: "include", // 確保帶入管理員登入狀態
        });
        const json = await res.json();
        const fullProduct = json.product;

        // 安全地尋找台幣 (TWD) 價格
        if (fullProduct?.variants && fullProduct.variants.length > 0) {
          const variant = fullProduct.variants[0];
          if (variant.prices && variant.prices.length > 0) {
            // 找出幣值為 twd 的設定
            const twdPrice = variant.prices.find(
              (p: any) => p.currency_code?.toLowerCase() === "twd",
            );
            // 找到台幣就用台幣，沒有就抓陣列裡的第一個價格
            const finalPrice = twdPrice
              ? twdPrice.amount
              : variant.prices[0].amount;
            setSellingPrice(finalPrice);
          }
        }
      } catch (error) {
        console.error("抓取商品價格失敗:", error);
      }
    };

    fetchPrice();
  }, [product]);

  // 自動計算邏輯
  const numCost = Number(cost) || 0;
  const profit = sellingPrice - numCost;
  const margin =
    sellingPrice > 0 ? ((profit / sellingPrice) * 100).toFixed(2) : 0;

  const handleSave = async () => {
    if (!product?.id) return;
    setIsLoading(true);

    try {
      const newMetadata = {
        ...(product?.metadata || {}),
        cost: numCost,
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

      toast.success("成本分析已成功寫入資料庫！");

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      toast.error("無法儲存成本設定", {
        description: error.message,
      });
      console.error("成本儲存錯誤:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!product) return null;

  return (
    <Container className="p-6 mt-4">
      <Heading level="h2" className="mb-4">
        利潤與成本分析
      </Heading>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div>
          <Text className="text-ui-fg-subtle mb-2">商品前台售價</Text>
          <Text className="text-xl font-bold">
            NT$ {sellingPrice.toLocaleString()}
          </Text>
        </div>
        <div>
          <Text className="text-ui-fg-subtle mb-2">預估毛利</Text>
          <Text
            className={clx(
              "text-xl font-bold",
              profit > 0 ? "text-green-600" : "text-red-500",
            )}
          >
            NT$ {profit.toLocaleString()}
          </Text>
        </div>
        <div>
          <Text className="text-ui-fg-subtle mb-2">毛利率 (Margin)</Text>
          <Text className="text-xl font-bold">{margin}%</Text>
        </div>
      </div>

      <div className="flex items-end gap-4 border-t border-gray-200 pt-6">
        <div className="flex-1">
          <Text className="text-ui-fg-subtle mb-2 text-small-plus font-semibold">
            輸入實際進貨成本
          </Text>
          <Input
            type="number"
            placeholder="例如: 50000"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={handleSave} isLoading={isLoading}>
          儲存成本設定
        </Button>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.details.after",
});

export default ProductCostWidget;
