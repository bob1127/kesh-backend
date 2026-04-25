import { useState, useRef, useEffect } from "react";
import { Container, Heading, Button, Input, Label } from "@medusajs/ui";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Photo } from "@medusajs/icons";

// 1. TypeScript 介面定義
interface SlideItem {
  id: number;
  title: string;
  category: string;
  alt: string;
  mediaUrl: string;
  type: string;
}

export default function HeroSliderAdminPage() {
  // 🔥 1. 把預設的酒類/精品圖片刪掉，改為空陣列
  const [slides, setSlides] = useState<SlideItem[]>([]);

  // 新增一個載入狀態，讓 UX 更好
  const [isFetching, setIsFetching] = useState(true);

  // UI 狀態控制
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 編輯中的表單狀態
  const [formData, setFormData] = useState<Omit<SlideItem, "id">>({
    title: "",
    category: "",
    alt: "",
    mediaUrl: "",
    type: "image",
  });

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==========================================
  // 🔥 2. 新增：元件載入時，自動從 API 抓取已儲存的輪播圖
  // ==========================================
  useEffect(() => {
    const fetchSavedSlides = async () => {
      try {
        const res = await fetch(`/admin/custom/hero-slides`, {
          credentials: "include", // 必須帶上登入憑證
        });

        if (res.ok) {
          const data = await res.json();
          // 假設你的後端 API 回傳格式為 { slides: [...] }
          if (data && data.slides) {
            setSlides(data.slides);
          }
        }
      } catch (error) {
        console.error("載入輪播圖發生錯誤:", error);
      } finally {
        setIsFetching(false);
      }
    };

    fetchSavedSlides();
  }, []);

  // --- 拖曳排序邏輯 ---
  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const _slides = [...slides];
    const draggedItemContent = _slides.splice(dragItem.current, 1)[0];
    _slides.splice(dragOverItem.current, 0, draggedItemContent);

    dragItem.current = null;
    dragOverItem.current = null;
    setSlides(_slides);
  };

  // --- 表單切換邏輯 ---
  const handleAddNew = () => {
    setEditingId(null);
    setFormData({
      title: "",
      category: "",
      alt: "",
      mediaUrl: "",
      type: "image",
    });
  };

  const handleEdit = (slide: SlideItem) => {
    setEditingId(slide.id);
    setFormData({
      title: slide.title,
      category: slide.category,
      alt: slide.alt,
      mediaUrl: slide.mediaUrl,
      type: slide.type,
    });
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("確定要刪除這張輪播圖嗎？")) return;
    const newSlides = slides.filter((s) => s.id !== id);
    setSlides(newSlides);
    if (editingId === id) handleAddNew();
  };

  // --- 圖片上傳邏輯 ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter((f) => f.size <= 1024 * 1024);
    if (validFiles.length < files.length) {
      alert(
        `⚠️ 警告：有 ${files.length - validFiles.length} 張圖片超過 1MB 限制，已被自動排除。`,
      );
    }

    if (validFiles.length === 0) {
      e.target.value = "";
      return;
    }

    const processedFiles = await Promise.all(
      validFiles.map((file) => {
        return new Promise<{ url: string }>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ url: reader.result as string });
          reader.readAsDataURL(file);
        });
      }),
    );

    if (processedFiles.length > 0) {
      setFormData({
        ...formData,
        mediaUrl: processedFiles[0].url,
        type: "image",
      });

      if (processedFiles.length > 1) {
        const extraSlides = processedFiles.slice(1).map((file, idx) => ({
          id: Date.now() + idx + 1,
          title: "",
          category: "",
          alt: "",
          mediaUrl: file.url,
          type: "image",
        }));
        setSlides((prev) => [...prev, ...extraSlides]);
        alert(
          `🎉 已成功載入第一張，並自動為其餘 ${processedFiles.length - 1} 張圖片建立新輪播項目！`,
        );
      }
    }
    e.target.value = "";
  };

  // --- 儲存單張 Slide (暫存在前端) ---
  const handleSaveSlide = () => {
    if (!formData.mediaUrl) return alert("請先上傳輪播圖片！");

    if (editingId) {
      const updatedSlides = slides.map((s) =>
        s.id === editingId ? { ...formData, id: editingId } : s,
      );
      setSlides(updatedSlides);
    } else {
      const newSlide = { ...formData, id: Date.now() };
      setSlides([...slides, newSlide]);
      handleAddNew();
    }
  };

  // --- 全局儲存 (打向後端 API) ---
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const targetUrl = `/admin/custom/hero-slides`;

      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides }),
        credentials: "include",
      });

      const contentType = res.headers.get("content-type");
      if (
        !res.ok ||
        !contentType ||
        !contentType.includes("application/json")
      ) {
        throw new Error("API 請求失敗或被攔截");
      }

      alert("💾 所有輪播設定已成功儲存並更新至首頁！");
    } catch (error) {
      console.error("儲存錯誤:", error);
      alert("❌ 儲存發生錯誤，請確保 Medusa 後端有正常運作。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Container className="p-4 md:p-8 max-w-[1400px] mx-auto flex flex-col gap-6 w-full bg-gray-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-lg border border-gray-200 shadow-sm gap-4">
        <div>
          <Heading level="h1" className="text-xl font-bold text-gray-900">
            首頁視覺大片管理 (Hero Slider)
          </Heading>
          <p className="text-sm text-gray-500 mt-1">
            管理前台首頁的輪播圖，支援拖曳排序與多圖上傳。
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleSaveAll}
          disabled={isSaving || isFetching}
          className="bg-black text-white hover:bg-gray-800 px-8"
        >
          {isSaving ? "儲存中..." : "儲存全局設定"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左側清單 */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex justify-between items-center">
              <span className="font-bold text-sm text-gray-700">
                目前輪播清單 ({slides.length})
              </span>
              <button
                onClick={handleAddNew}
                className="text-blue-600 text-xs font-bold hover:underline"
              >
                + 新增輪播
              </button>
            </div>

            <div className="p-2 space-y-2">
              {/* 🔥 3. 處理載入中與空狀態的 UI */}
              {isFetching ? (
                <div className="text-center py-8 text-gray-400 text-sm animate-pulse">
                  資料讀取中...
                </div>
              ) : slides.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  尚未加入任何輪播圖
                </div>
              ) : (
                slides.map((slide, index) => (
                  <div
                    key={slide.id}
                    draggable
                    onDragStart={() => (dragItem.current = index)}
                    onDragEnter={() => (dragOverItem.current = index)}
                    onDragEnd={handleSort}
                    onClick={() => handleEdit(slide)}
                    className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-all duration-200 group
                      ${editingId === slide.id ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"}`}
                  >
                    <div className="text-gray-300 cursor-grab active:cursor-grabbing px-1 group-hover:text-gray-500">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="4" y1="9" x2="20" y2="9"></line>
                        <line x1="4" y1="15" x2="20" y2="15"></line>
                      </svg>
                    </div>
                    <div className="w-16 h-10 bg-gray-100 rounded overflow-hidden shrink-0 border border-gray-200 relative">
                      <img
                        src={slide.mediaUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-800 truncate">
                        {slide.title || "未命名標題"}
                      </div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider truncate">
                        {slide.category || "無分類"}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(slide.id, e)}
                      className="text-gray-400 hover:text-red-500 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 text-center">
            💡 提示：按住清單項目可上下拖曳排序
          </p>
        </div>

        {/* 右側編輯區 */}
        <div className="lg:col-span-7 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden sticky top-6">
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            <Heading
              level="h2"
              className="text-base font-bold text-gray-800 m-0"
            >
              {editingId ? "✏️ 編輯輪播圖" : "✨ 新增輪播圖"}
            </Heading>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <Label className="mb-2 block font-bold text-sm text-gray-800">
                1. 視覺圖片 (Max: 1MB, 支援多選)
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 hover:border-blue-400 transition-colors relative cursor-pointer"
              >
                {formData.mediaUrl ? (
                  <div className="relative aspect-[21/9] w-full rounded overflow-hidden shadow-sm">
                    <img
                      src={formData.mediaUrl}
                      alt="preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <span className="text-white font-bold text-sm bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">
                        點擊更換，或框選多張圖片批次加入
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-[21/9] w-full flex flex-col items-center justify-center text-gray-400">
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="mb-2 text-gray-400"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                      ></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <span className="text-sm font-bold text-gray-600">
                      點擊瀏覽檔案 (可框選多張)
                    </span>
                    <span className="text-xs mt-1 text-gray-400">
                      支援 JPG, PNG, WEBP
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block font-bold text-xs uppercase text-gray-600">
                  Category (副標籤/分類)
                </Label>
                <Input
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  placeholder="例如: KÉSH de¹"
                />
              </div>
              <div>
                <Label className="mb-2 block font-bold text-xs uppercase text-gray-600">
                  Title (主標題)
                </Label>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="例如: Luxury Boutique"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="mb-2 block font-bold text-xs uppercase text-blue-600 flex items-center gap-1">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  SEO Alt Text (圖片替代文字)
                </Label>
                <Input
                  value={formData.alt}
                  onChange={(e) =>
                    setFormData({ ...formData, alt: e.target.value })
                  }
                  placeholder="描述這張圖片，例如：2026 新款愛馬仕黑色凱莉包"
                  className="border-blue-200 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <Button
                onClick={handleSaveSlide}
                className="bg-[#0073e6] text-white hover:bg-blue-700 px-8 border-none"
              >
                {editingId ? "更新此輪播圖" : "加入輪播清單"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}

export const config = defineRouteConfig({
  label: "首頁輪播設定",
  icon: Photo,
});
