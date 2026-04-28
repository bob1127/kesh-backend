import { useState, useRef, useEffect } from "react";
import { Container, Heading, Button, Input, Label } from "@medusajs/ui";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Photo } from "@medusajs/icons";

interface SlideItem {
  id: number;
  title: string;
  category: string;
  alt: string;
  mediaUrl: string;
  type: string;
}

export default function HeroSliderAdminPage() {
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // 🔥 新增：用來即時顯示「拖曳放置目標」的狀態
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [formData, setFormData] = useState<Omit<SlideItem, "id">>({
    title: "",
    category: "",
    alt: "",
    mediaUrl: "",
    type: "image",
  });

  const dragItem = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. 載入時讀取資料
  useEffect(() => {
    const fetchSavedSlides = async () => {
      try {
        const res = await fetch(`/admin/custom/hero-slides?t=${Date.now()}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.slides) setSlides(data.slides);
        }
      } catch (error) {
        console.error("載入失敗:", error);
      } finally {
        setIsFetching(false);
      }
    };
    fetchSavedSlides();
  }, []);

  // 2. 圖片上傳
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);

    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const fileExtension = file.name.split(".").pop() || "jpg";
        const safeFileName = `hero_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExtension}`;
        const safeFile = new File([file], safeFileName, { type: file.type });

        const fd = new FormData();
        fd.append("files", safeFile);

        const uploadRes = await fetch(`/admin/uploads`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          const url =
            uploadData.files?.[0]?.url || uploadData.uploads?.[0]?.url;
          if (url) uploadedUrls.push(url);
        }
      }

      if (uploadedUrls.length > 0) {
        setFormData({ ...formData, mediaUrl: uploadedUrls[0] });
        if (uploadedUrls.length > 1) {
          const extras = uploadedUrls.slice(1).map((url, idx) => ({
            id: Date.now() + idx,
            title: "",
            category: "",
            alt: "",
            mediaUrl: url,
            type: "image",
          }));
          setSlides((prev) => [...prev, ...extras]);
        }
      }
    } catch (error) {
      alert("上傳失敗，請檢查後端連線");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  // 3. 儲存單張到清單
  const handleSaveSlide = () => {
    if (!formData.mediaUrl) return alert("請先上傳圖片");
    if (editingId) {
      setSlides(
        slides.map((s) =>
          s.id === editingId ? { ...formData, id: editingId } : s,
        ),
      );
    } else {
      setSlides([...slides, { ...formData, id: Date.now() }]);
      setFormData({
        title: "",
        category: "",
        alt: "",
        mediaUrl: "",
        type: "image",
      });
    }
  };

  // 4. 存入資料庫
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/admin/custom/hero-slides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides }),
        credentials: "include",
      });
      if (res.ok) alert("儲存成功！");
    } catch (error) {
      alert("儲存發生錯誤");
    } finally {
      setIsSaving(false);
    }
  };

  // 🔥 5. 強化版：拖曳排序邏輯
  const handleSort = () => {
    if (dragItem.current === null || dragOverIndex === null) {
      setDragOverIndex(null);
      return;
    }
    const _s = [...slides];
    const item = _s.splice(dragItem.current, 1)[0];
    _s.splice(dragOverIndex, 0, item); // 插入新位置

    // 重置狀態
    dragItem.current = null;
    setDragOverIndex(null);
    setSlides(_s);
  };

  return (
    <Container className="p-4 md:p-8 max-w-[1400px] mx-auto flex flex-col gap-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center bg-white p-6 rounded-lg border shadow-sm">
        <Heading level="h1">首頁輪播視覺管理</Heading>
        <Button
          onClick={handleSaveAll}
          disabled={isSaving || isFetching}
          className="bg-black text-white px-8"
        >
          {isSaving ? "儲存中..." : "儲存全局設定"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="bg-gray-50 p-4 flex justify-between items-center border-b">
              <span className="font-bold text-sm text-gray-800">
                目前清單 ({slides.length})
              </span>
              <button
                onClick={() => {
                  setEditingId(null);
                  setFormData({
                    title: "",
                    category: "",
                    alt: "",
                    mediaUrl: "",
                    type: "image",
                  });
                }}
                className="text-blue-600 text-xs font-bold hover:underline"
              >
                + 新增
              </button>
            </div>

            <div className="p-3 space-y-2">
              {isFetching ? (
                <div className="text-center py-8 text-gray-400 animate-pulse">
                  讀取中...
                </div>
              ) : slides.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  尚未加入任何輪播圖
                </div>
              ) : (
                slides.map((s, i) => {
                  // 判斷目前的樣式狀態
                  const isEditing = editingId === s.id;
                  const isDragOver = dragOverIndex === i;
                  const isBeingDragged = dragItem.current === i;

                  return (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={() => {
                        dragItem.current = i;
                      }}
                      onDragEnter={() => setDragOverIndex(i)}
                      onDragEnd={handleSort}
                      onDragOver={(e) => e.preventDefault()} // 必須加這行才能允許放下
                      onClick={() => {
                        setEditingId(s.id);
                        setFormData(s);
                      }}
                      className={`
                      flex items-center gap-4 p-3 border rounded-lg cursor-pointer transition-all duration-200 ease-in-out
                      ${isEditing ? "border-blue-500 bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:bg-gray-50"}
                      ${isDragOver ? "border-blue-400 ring-2 ring-blue-200 bg-blue-50/50 shadow-md scale-[1.01]" : ""}
                      ${isBeingDragged ? "opacity-50" : "opacity-100"}
                    `}
                    >
                      {/* Medusa 原生風格的六點拖曳把手 */}
                      <div className="text-gray-400 cursor-grab active:cursor-grabbing hover:text-gray-600 px-1">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="9" cy="5" r="1"></circle>
                          <circle cx="9" cy="12" r="1"></circle>
                          <circle cx="9" cy="19" r="1"></circle>
                          <circle cx="15" cy="5" r="1"></circle>
                          <circle cx="15" cy="12" r="1"></circle>
                          <circle cx="15" cy="19" r="1"></circle>
                        </svg>
                      </div>

                      <img
                        src={s.mediaUrl}
                        className="w-16 h-10 object-cover rounded shadow-sm border border-gray-200"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-800 truncate">
                          {s.title || "未命名標題"}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest truncate mt-0.5">
                          {s.category || "無分類"}
                        </div>
                      </div>

                      {/* 🔥 替換成乾淨的文字刪除按鈕 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("確定要刪除這張圖片嗎？")) {
                            setSlides(slides.filter((x) => x.id !== s.id));
                            if (editingId === s.id) setEditingId(null);
                          }
                        }}
                        className="text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded transition-colors"
                      >
                        刪除
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            提示：按住左側把手可拖曳排序圖片位置
          </p>
        </div>

        <div className="lg:col-span-7 bg-white border rounded-lg p-6 space-y-6 sticky top-6">
          <Heading level="h2" className="text-base">
            {editingId ? "編輯項目" : " 新增項目"}
          </Heading>
          <div>
            <Label className="mb-2 block">1. 上傳圖片</Label>
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
              className="p-4 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg bg-gray-50 text-center cursor-pointer transition-colors"
            >
              {isUploading ? (
                <div className="animate-pulse text-blue-600 font-bold py-10">
                  圖片上傳處理中...
                </div>
              ) : formData.mediaUrl ? (
                <img
                  src={formData.mediaUrl}
                  className="aspect-[21/9] w-full object-cover rounded shadow-sm"
                />
              ) : (
                <div className="py-10 text-gray-400 font-medium">
                  點擊上傳圖片 (可框選多張)
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block text-xs">分類 (Category)</Label>
              <Input
                placeholder="例如: KÉSH de¹"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">主標題 (Title)</Label>
              <Input
                placeholder="例如: Luxury Boutique"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-blue-600">
              SEO 替代文字 (Alt Text)
            </Label>
            <Input
              placeholder="例如：2026 新款愛馬仕黑色凱莉包"
              value={formData.alt}
              onChange={(e) =>
                setFormData({ ...formData, alt: e.target.value })
              }
            />
          </div>
          <Button
            onClick={handleSaveSlide}
            className="w-full bg-[#0073e6] text-white hover:bg-blue-700"
          >
            {editingId ? "更新項目" : "加入清單"}
          </Button>
        </div>
      </div>
    </Container>
  );
}

export const config = defineRouteConfig({ label: "首頁輪播設定", icon: Photo });
