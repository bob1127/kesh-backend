import { useState, useEffect, useMemo } from "react";
import {
  Container,
  Heading,
  Button,
  Input,
  Label,
  Textarea,
} from "@medusajs/ui";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { DocumentText } from "@medusajs/icons";

export default function NewsAdminPage() {
  // --- 視圖控制與列表狀態 ---
  const [currentView, setCurrentView] = useState<"list" | "form">("list");
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- 表單狀態 ---
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [structuredData, setStructuredData] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const quillModules = useMemo(
    () => ({
      toolbar: [
        [{ header: [1, 2, 3, 4, 5, 6, false] }],
        ["bold", "italic", "underline", "strike", "blockquote"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ color: [] }, { background: [] }],
        [{ align: [] }],
        ["link", "image", "video"],
        ["clean"],
      ],
    }),
    [],
  );

  // --- API: 取得文章列表 ---
  const fetchPosts = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch("http://localhost:9000/admin/custom/posts", {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) setPosts(data.posts || []);
    } catch (error) {
      console.error("Fetch list error:", error);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    if (currentView === "list") fetchPosts();
  }, [currentView]);

  // --- 切換到「新增」 ---
  const handleCreateNew = () => {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setExcerpt("");
    setContent("");
    setThumbnail("");
    setSeoTitle("");
    setSeoDescription("");
    setSeoKeywords("");
    setStructuredData("");
    setIsActive(true);
    setCurrentView("form");
  };

  // --- 切換到「編輯」 ---
  const handleEdit = async (id: string) => {
    setEditingId(id);
    setCurrentView("form");
    try {
      const res = await fetch(
        `http://localhost:9000/admin/custom/posts/${id}`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (res.ok && data.post) {
        const p = data.post;
        setTitle(p.title || "");
        setSlug(p.slug || "");
        setExcerpt(p.excerpt || "");
        setContent(p.content || "");
        setThumbnail(p.thumbnail || "");
        setIsActive(p.is_active ?? true);
        setSeoTitle(p.seo_title || "");
        setSeoDescription(p.seo_description || "");
        setSeoKeywords(p.seo_keywords || "");
        setStructuredData(p.structured_data || "");
      }
    } catch (error) {
      console.error("Fetch single post error:", error);
    }
  };

  // --- API: 刪除文章 ---
  const handleDelete = async (id: string) => {
    if (!window.confirm("確定要刪除這篇文章嗎？此動作無法復原！")) return;
    try {
      const res = await fetch(
        `http://localhost:9000/admin/custom/posts/${id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (res.ok) {
        alert("🗑️ 文章已刪除");
        fetchPosts();
      } else {
        alert("刪除失敗");
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  // --- API: 儲存文章 ---
  const handleSave = async () => {
    if (!title || !slug)
      return alert("⚠️ 「文章標題」與「網址代稱 (Slug)」為必填項目！");

    setIsUploading(true);
    const postData = {
      title,
      slug,
      excerpt,
      content,
      thumbnail,
      is_active: isActive,
      seo_title: seoTitle,
      seo_description: seoDescription,
      seo_keywords: seoKeywords,
      structured_data: structuredData,
    };

    try {
      const method = editingId ? "PUT" : "POST";
      const url = editingId
        ? `http://localhost:9000/admin/custom/posts/${editingId}`
        : "http://localhost:9000/admin/custom/posts";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postData),
        credentials: "include",
      });

      if (res.ok) {
        alert(editingId ? "✅ 文章更新成功！" : "🎉 文章發佈大成功！");
        setCurrentView("list");
      } else {
        const err = await res.json();
        alert(`❌ 儲存失敗: ${err.message}`);
      }
    } catch (error) {
      console.error("Save exception:", error);
      alert("伺服器連線失敗");
    } finally {
      setIsUploading(false);
    }
  };

  // --- 圖片上傳 ---
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const originalFile = e.target.files?.[0];
    if (!originalFile) return;
    setIsUploading(true);
    try {
      const fileExtension = originalFile.name.split(".").pop() || "png";
      const safeFileName = `news_thumb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExtension}`;
      const safeFile = new File([originalFile], safeFileName, {
        type: originalFile.type,
      });
      const formData = new FormData();
      formData.append("files", safeFile);
      const res = await fetch("http://localhost:9000/admin/uploads", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.files && data.files.length > 0)
        setThumbnail(data.files[0].url);
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  // ==========================================
  // UI 渲染區段：列表視圖 (List View)
  // ==========================================
  if (currentView === "list") {
    return (
      <Container className="p-4 md:p-8 max-w-[1200px] mx-auto flex flex-col gap-6 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 pb-4 gap-4">
          <Heading level="h1">最新消息/文章 (News)</Heading>
          <Button
            variant="primary"
            onClick={handleCreateNew}
            className="w-full sm:w-auto"
          >
            + 新增文章
          </Button>
        </div>

        {isLoadingList ? (
          <p className="text-gray-500 text-center py-10">載入中...</p>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 mx-auto w-full">
            目前還沒有任何文章，點擊右上角新增吧！
          </div>
        ) : (
          <div className="w-full overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left text-sm text-gray-700 min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 md:px-6 py-4">圖片</th>
                  <th className="px-4 md:px-6 py-4">文章標題</th>
                  <th className="px-4 md:px-6 py-4">網址 (Slug)</th>
                  <th className="px-4 md:px-6 py-4">狀態</th>
                  <th className="px-4 md:px-6 py-4">建立日期</th>
                  <th className="px-4 md:px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {posts.map((post: any) => (
                  <tr
                    key={post.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 md:px-6 py-4 w-24">
                      {post.thumbnail ? (
                        <img
                          src={post.thumbnail}
                          alt=""
                          className="w-12 h-12 object-cover rounded-md border border-gray-200"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-md border border-gray-200 flex items-center justify-center text-[10px] text-gray-400">
                          無圖
                        </div>
                      )}
                    </td>
                    <td className="px-4 md:px-6 py-4 font-bold text-gray-900">
                      {post.title}
                    </td>
                    <td className="px-4 md:px-6 py-4 text-gray-500">
                      {post.slug}
                    </td>
                    <td className="px-4 md:px-6 py-4">
                      <span
                        className={`px-2 py-1 text-[10px] rounded-full font-bold whitespace-nowrap ${post.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}
                      >
                        {post.is_active ? "已發布" : "草稿"}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-4 text-gray-500 whitespace-nowrap">
                      {new Date(post.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 md:px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => handleEdit(post.id)}
                      >
                        編輯
                      </Button>
                      <Button
                        variant="danger"
                        size="small"
                        onClick={() => handleDelete(post.id)}
                      >
                        刪除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Container>
    );
  }

  // ==========================================
  // UI 渲染區段：表單視圖 (Form View)
  // ==========================================
  return (
    <Container className="p-4 md:p-8 max-w-[1200px] mx-auto flex flex-col gap-6 md:gap-10 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 pb-4 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto border-b md:border-b-0 border-gray-100 pb-4 md:pb-0">
          <Button
            variant="transparent"
            onClick={() => setCurrentView("list")}
            className="text-gray-500 px-0 md:px-4 shrink-0"
          >
            ← 列表
          </Button>
          <Heading level="h1" className="text-lg md:text-2xl truncate">
            {editingId ? "編輯文章" : "發佈新文章"}
          </Heading>
        </div>

        <div className="flex items-center justify-between w-full md:w-auto gap-4 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-black w-4 h-4 md:w-5 md:h-5"
            />
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">
              公開發佈
            </span>
          </label>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isUploading}
            className="w-full md:w-auto"
          >
            {isUploading ? "處理中..." : "儲存設定"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* 左側：主要內容區 */}
        <div className="lg:col-span-2 flex flex-col gap-6 w-full">
          <div>
            <Label className="mb-2 block font-bold text-stone-800">
              文章標題 (Title) *
            </Label>
            <Input
              placeholder="輸入吸睛的標題..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <Label className="mb-2 block font-bold">文章內容 (Content)</Label>
            <div className="bg-white rounded-md border border-gray-200 w-full overflow-x-auto">
              <ReactQuill
                theme="snow"
                modules={quillModules}
                value={content}
                onChange={setContent}
                style={{
                  height: "400px",
                  paddingBottom: "40px",
                  minWidth: "100%",
                }}
                className="md:h-[500px]"
              />
            </div>
          </div>

          <div className="mt-4 md:mt-8 p-4 md:p-6 bg-gray-50 border border-gray-200 rounded-lg flex flex-col gap-4 w-full">
            <Heading level="h2" className="text-base md:text-lg text-gray-800">
              🔍 SEO 與結構化標籤
            </Heading>
            <div>
              <Label className="mb-2 block">SEO 標題</Label>
              <Input
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <Label className="mb-2 block">SEO 描述</Label>
              <Textarea
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                className="w-full h-20 md:h-24"
              />
            </div>
            <div>
              <Label className="mb-2 block">SEO 關鍵字</Label>
              <Input
                value={seoKeywords}
                onChange={(e) => setSeoKeywords(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <Label className="mb-2 block text-blue-600">
                Schema 標籤 (JSON-LD)
              </Label>
              <Textarea
                className="font-mono text-xs md:text-sm h-24 md:h-32 w-full"
                value={structuredData}
                onChange={(e) => setStructuredData(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* 右側：設定面板 */}
        <div className="flex flex-col gap-6 w-full">
          <div className="p-4 md:p-6 border border-gray-200 rounded-lg bg-white w-full">
            <Heading level="h2" className="text-base mb-4">
              文章設定
            </Heading>
            <div className="mb-4">
              <Label className="mb-2 block text-stone-800">
                網址代稱 (Slug) *
              </Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full"
              />
              <span className="text-xs text-gray-400 mt-1 block truncate">
                網址將會是: /news/{slug || "..."}
              </span>
            </div>
            <div>
              <Label className="mb-2 block">文章摘要 (Excerpt)</Label>
              <Textarea
                className="h-20 md:h-24 w-full"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
              />
            </div>
          </div>

          <div className="p-4 md:p-6 border border-gray-200 rounded-lg bg-white w-full">
            <Heading level="h2" className="text-base mb-4">
              封面圖片 (Thumbnail)
            </Heading>
            {thumbnail ? (
              <div className="mb-4 relative rounded overflow-hidden border border-gray-200 aspect-[4/3] w-full">
                <img
                  src={thumbnail}
                  alt="Thumbnail preview"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => setThumbnail("")}
                  className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-sm hover:bg-red-600"
                >
                  移除
                </button>
              </div>
            ) : (
              <div className="mb-4 aspect-[4/3] w-full bg-gray-100 border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 text-sm">
                尚未上傳圖片
              </div>
            )}

            <div className="w-full overflow-hidden">
              <Input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={isUploading}
                className="w-full text-xs md:text-sm"
              />
            </div>

            {isUploading && (
              <span className="text-xs text-blue-500 mt-2 block font-medium">
                圖片上傳中...
              </span>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100">
              <Label className="mb-2 block text-xs text-gray-500">
                或直接貼上圖片網址
              </Label>
              <Input
                value={thumbnail}
                onChange={(e) => setThumbnail(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}

export const config = defineRouteConfig({
  label: "最新消息 / 文章",
  icon: DocumentText,
});
