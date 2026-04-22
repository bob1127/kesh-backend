import { useState } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import {
  Container,
  Heading,
  Button,
  Tabs,
  Input,
  Label,
  Textarea,
} from "@medusajs/ui";

const ProductTranslationsWidget = ({ data: product }: { data: any }) => {
  // 🇹🇼 讀取 ZH 擴充欄位 (預設中文)
  const [conditionZh, setConditionZh] = useState(
    product?.metadata?.condition_zh || "",
  );
  const [paymentZh, setPaymentZh] = useState(
    product?.metadata?.payment_zh || "",
  );
  const [shippingZh, setShippingZh] = useState(
    product?.metadata?.shipping_zh || "",
  );
  const [faqZh, setFaqZh] = useState(product?.metadata?.faq_zh || "");

  // 🇺🇸 讀取 EN 翻譯
  const [titleEn, setTitleEn] = useState(product?.metadata?.title_en || "");
  const [subtitleEn, setSubtitleEn] = useState(
    product?.metadata?.subtitle_en || "",
  );
  const [descEn, setDescEn] = useState(product?.metadata?.desc_en || "");
  const [conditionEn, setConditionEn] = useState(
    product?.metadata?.condition_en || "",
  );
  const [paymentEn, setPaymentEn] = useState(
    product?.metadata?.payment_en || "",
  );
  const [shippingEn, setShippingEn] = useState(
    product?.metadata?.shipping_en || "",
  );
  const [faqEn, setFaqEn] = useState(product?.metadata?.faq_en || "");

  // 🇰🇷 讀取 KO 翻譯
  const [titleKo, setTitleKo] = useState(product?.metadata?.title_ko || "");
  const [subtitleKo, setSubtitleKo] = useState(
    product?.metadata?.subtitle_ko || "",
  );
  const [descKo, setDescKo] = useState(product?.metadata?.desc_ko || "");
  const [conditionKo, setConditionKo] = useState(
    product?.metadata?.condition_ko || "",
  );
  const [paymentKo, setPaymentKo] = useState(
    product?.metadata?.payment_ko || "",
  );
  const [shippingKo, setShippingKo] = useState(
    product?.metadata?.shipping_ko || "",
  );
  const [faqKo, setFaqKo] = useState(product?.metadata?.faq_ko || "");

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveTranslations = async () => {
    if (!product?.id) return;

    setIsSaving(true);
    try {
      const res = await fetch(
        `http://localhost:9000/admin/products/${product.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            metadata: {
              ...product.metadata,
              // 儲存中文擴充
              condition_zh: conditionZh,
              payment_zh: paymentZh,
              shipping_zh: shippingZh,
              faq_zh: faqZh,
              // 儲存英文
              title_en: titleEn,
              subtitle_en: subtitleEn,
              desc_en: descEn,
              condition_en: conditionEn,
              payment_en: paymentEn,
              shipping_en: shippingEn,
              faq_en: faqEn,
              // 儲存韓文
              title_ko: titleKo,
              subtitle_ko: subtitleKo,
              desc_ko: descKo,
              condition_ko: conditionKo,
              payment_ko: paymentKo,
              shipping_ko: shippingKo,
              faq_ko: faqKo,
            },
          }),
          credentials: "include",
        },
      );

      if (res.ok) {
        alert("🎉 多語系與擴充欄位儲存成功！");
      } else {
        const err = await res.json();
        alert(`❌ 儲存失敗: ${err.message}`);
      }
    } catch (error) {
      console.error("Save translations error:", error);
      alert("伺服器連線失敗");
    } finally {
      setIsSaving(false);
    }
  };

  if (!product) return null;

  return (
    <Container className="p-6 mt-8 flex flex-col gap-6 border border-gray-200 shadow-sm">
      <div className="flex justify-between items-center border-b border-gray-100 pb-4">
        <div>
          <Heading level="h2" className="text-xl">
            多語系與自訂擴充資訊
          </Heading>
          <p className="text-xs text-gray-500 mt-1">
            請填寫各語系的純文字對應內容，前台將自動切換顯示。
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleSaveTranslations}
          disabled={isSaving}
        >
          {isSaving ? "儲存中..." : "儲存設定"}
        </Button>
      </div>

      <Tabs defaultValue="zh">
        <Tabs.List className="mb-6">
          <Tabs.Trigger value="zh">🇹🇼 中文擴充 (預設)</Tabs.Trigger>
          <Tabs.Trigger value="en">🇺🇸 English (英文)</Tabs.Trigger>
          <Tabs.Trigger value="ko">🇰🇷 한국어 (韓文)</Tabs.Trigger>
        </Tabs.List>

        {/* ================= 台灣中文 (僅擴充欄位) ================= */}
        <Tabs.Content value="zh" className="flex flex-col gap-8">
          <div className="flex flex-col gap-5 p-5 bg-blue-50/50 border border-blue-100 rounded-lg">
            <Heading
              level="h3"
              className="text-base text-gray-800 mb-2 border-b border-gray-200 pb-2"
            >
              預設語系擴充資訊
            </Heading>
            <p className="text-xs text-gray-500 mb-2">
              提示：中文的「標題」、「副標題」與「描述」請直接在上方 Medusa
              官方區塊修改。這裡僅用來補充官方缺少的欄位。
            </p>

            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                商品狀況 (Condition)
              </Label>
              <Input
                value={conditionZh}
                onChange={(e) => setConditionZh(e.target.value)}
                placeholder="例如：9成新 / 保存良好"
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                付款方式 (Payment Methods)
              </Label>
              <Textarea
                value={paymentZh}
                onChange={(e) => setPaymentZh(e.target.value)}
                className="min-h-[80px]"
                placeholder="例如：信用卡、ATM 轉帳、LINE Pay..."
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                配送說明 (Shipping Info)
              </Label>
              <Textarea
                value={shippingZh}
                onChange={(e) => setShippingZh(e.target.value)}
                className="min-h-[80px]"
                placeholder="例如：全館滿額免運，現貨 3 天內寄出..."
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                常見問題 (FAQ)
              </Label>
              <Textarea
                value={faqZh}
                onChange={(e) => setFaqZh(e.target.value)}
                className="min-h-[80px]"
                placeholder="例如：Q: 是正品嗎？ A: 百分百正品..."
              />
            </div>
          </div>
        </Tabs.Content>

        {/* ================= 英文設定區 ================= */}
        <Tabs.Content value="en" className="flex flex-col gap-8">
          <div className="flex flex-col gap-5 p-5 bg-gray-50 border border-gray-100 rounded-lg">
            <Heading
              level="h3"
              className="text-base text-gray-800 mb-2 border-b border-gray-200 pb-2"
            >
              基本商品資訊
            </Heading>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                英文標題 (Title)
              </Label>
              <Input
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="e.g. Louis Vuitton CarryAll PM..."
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                英文副標題 (Subtitle)
              </Label>
              <Input
                value={subtitleEn}
                onChange={(e) => setSubtitleEn(e.target.value)}
                placeholder="e.g. Include inner bag..."
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                英文商品狀況 (Condition)
              </Label>
              <Input
                value={conditionEn}
                onChange={(e) => setConditionEn(e.target.value)}
                placeholder="e.g. 90% New / Excellent condition"
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                英文描述 (Description)
              </Label>
              <Textarea
                value={descEn}
                onChange={(e) => setDescEn(e.target.value)}
                className="min-h-[150px] font-sans"
                placeholder="Paste the English description here..."
              />
            </div>
          </div>

          <div className="flex flex-col gap-5 p-5 bg-gray-50 border border-gray-100 rounded-lg">
            <Heading
              level="h3"
              className="text-base text-gray-800 mb-2 border-b border-gray-200 pb-2"
            >
              摺疊面板資訊 (Accordion)
            </Heading>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                英文付款方式 (Payment Methods)
              </Label>
              <Textarea
                value={paymentEn}
                onChange={(e) => setPaymentEn(e.target.value)}
                className="min-h-[80px]"
                placeholder="e.g. Credit Card, PayPal, Installment..."
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                英文配送說明 (Shipping Info)
              </Label>
              <Textarea
                value={shippingEn}
                onChange={(e) => setShippingEn(e.target.value)}
                className="min-h-[80px]"
                placeholder="e.g. Free shipping on orders over $500..."
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                英文常見問題 (FAQ)
              </Label>
              <Textarea
                value={faqEn}
                onChange={(e) => setFaqEn(e.target.value)}
                className="min-h-[80px]"
                placeholder="e.g. Q: Is it authentic? A: Yes..."
              />
            </div>
          </div>
        </Tabs.Content>

        {/* ================= 韓文設定區 ================= */}
        <Tabs.Content value="ko" className="flex flex-col gap-8">
          <div className="flex flex-col gap-5 p-5 bg-gray-50 border border-gray-100 rounded-lg">
            <Heading
              level="h3"
              className="text-base text-gray-800 mb-2 border-b border-gray-200 pb-2"
            >
              기본 상품 정보 (基本商品資訊)
            </Heading>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                韓文標題 (Title)
              </Label>
              <Input
                value={titleKo}
                onChange={(e) => setTitleKo(e.target.value)}
                placeholder="e.g. 루이비통 캐리올 PM..."
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                韓文副標題 (Subtitle)
              </Label>
              <Input
                value={subtitleKo}
                onChange={(e) => setSubtitleKo(e.target.value)}
                placeholder="e.g. 이너백 포함..."
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                韓文商品狀況 (Condition)
              </Label>
              <Input
                value={conditionKo}
                onChange={(e) => setConditionKo(e.target.value)}
                placeholder="e.g. S급 / 상태 아주 좋음"
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                韓文描述 (Description)
              </Label>
              <Textarea
                value={descKo}
                onChange={(e) => setDescKo(e.target.value)}
                className="min-h-[150px] font-sans"
                placeholder="여기에 한국어 설명을 입력하세요..."
              />
            </div>
          </div>

          <div className="flex flex-col gap-5 p-5 bg-gray-50 border border-gray-100 rounded-lg">
            <Heading
              level="h3"
              className="text-base text-gray-800 mb-2 border-b border-gray-200 pb-2"
            >
              아코디언 정보 (摺疊面板資訊)
            </Heading>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                韓文付款方式 (Payment Methods)
              </Label>
              <Textarea
                value={paymentKo}
                onChange={(e) => setPaymentKo(e.target.value)}
                className="min-h-[80px]"
                placeholder="결제 방법 입력..."
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                韓文配送說明 (Shipping Info)
              </Label>
              <Textarea
                value={shippingKo}
                onChange={(e) => setShippingKo(e.target.value)}
                className="min-h-[80px]"
                placeholder="배송 안내 입력..."
              />
            </div>
            <div>
              <Label className="mb-2 block font-bold text-gray-700">
                韓文常見問題 (FAQ)
              </Label>
              <Textarea
                value={faqKo}
                onChange={(e) => setFaqKo(e.target.value)}
                className="min-h-[80px]"
                placeholder="자주 묻는 질문 입력..."
              />
            </div>
          </div>
        </Tabs.Content>
      </Tabs>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.details.after",
});

export default ProductTranslationsWidget;
