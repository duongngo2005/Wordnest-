"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Search,
  Loader2,
  Image as ImageIcon,
  Trash2,
  Check,
  Sparkles,
  Link2,
  Upload,
  Clipboard,
} from "lucide-react";
import { ImageCandidate } from "@/services/images";

export interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  term: string;
  currentImageUrl?: string | null;
  initialQuery?: string | null;
  onSelectImage: (imageData: {
    imageUrl: string;
    imageSource?: string | null;
    imageSearchQuery?: string | null;
    imagePageUrl?: string | null;
    imageAuthor?: string | null;
  }) => Promise<void>;
  onRemoveImage?: () => Promise<void>;
}

export function ImagePickerModal({
  isOpen,
  onClose,
  term,
  currentImageUrl,
  initialQuery,
  onSelectImage,
  onRemoveImage,
}: ImagePickerModalProps) {
  const defaultQuery = initialQuery || `${term} illustration`;
  const [searchQuery, setSearchQuery] = useState(defaultQuery);
  const [images, setImages] = useState<ImageCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(currentImageUrl || null);
  const [customUrl, setCustomUrl] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"search" | "upload" | "custom">("search");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch images on mount
  useEffect(() => {
    let ignore = false;
    const query = defaultQuery.trim();
    if (!query) {
      return;
    }

    fetch(`/api/images/search?q=${encodeURIComponent(query)}&limit=12`)
      .then((res) => {
        if (!res.ok) throw new Error("Không thể tìm kiếm ảnh lúc này.");
        return res.json();
      })
      .then((data) => {
        if (ignore) return;
        if (data.success && Array.isArray(data.images)) {
          setImages(data.images);
          if (data.images.length === 0) {
            setError("Không tìm thấy ảnh phù hợp. Hãy thử từ khóa khác hoặc dán ảnh.");
          }
        } else {
          setImages([]);
          setError(data.error || "Không tìm thấy ảnh.");
        }
      })
      .catch((err) => {
        if (ignore) return;
        console.error("Search failed:", err);
        setError("Đã xảy ra lỗi khi tìm ảnh. Vui lòng kiểm tra kết nối.");
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [defaultQuery]);

  // Fetch images from API for user manual searches
  const performSearch = useCallback(async (queryToSearch: string) => {
    const trimmed = queryToSearch.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/images/search?q=${encodeURIComponent(trimmed)}&limit=12`);
      if (!res.ok) {
        throw new Error("Không thể tìm kiếm ảnh lúc này.");
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.images)) {
        setImages(data.images);
        if (data.images.length === 0) {
          setError("Không tìm thấy ảnh phù hợp. Hãy thử từ khóa khác.");
        }
      } else {
        setImages([]);
        setError(data.error || "Không tìm thấy ảnh.");
      }
    } catch (err) {
      console.error("Search failed:", err);
      setError("Đã xảy ra lỗi khi tìm ảnh. Vui lòng kiểm tra kết nối.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Upload a local file or pasted image blob
  const handleUploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload/image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Tải ảnh lên thất bại.");
      }

      // Cleanup old local file if replacing
      if (currentImageUrl && currentImageUrl.startsWith("/uploads/cards/")) {
        fetch(`/api/upload/image?url=${encodeURIComponent(currentImageUrl)}`, {
          method: "DELETE",
        }).catch((err) => console.warn("Could not delete old image:", err));
      }

      setSelectedUrl(data.imageUrl);
      await onSelectImage({
        imageUrl: data.imageUrl,
        imageSource: "MANUAL",
        imageSearchQuery: searchQuery,
      });
      onClose();
    } catch (err) {
      console.error("Failed to upload image:", err);
      setUploadError(err instanceof Error ? err.message : "Tải ảnh lên không thành công.");
    } finally {
      setIsUploading(false);
    }
  };

  // Clipboard paste listener within modal context
  const handleModalPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await handleUploadFile(file);
          return;
        }
      }
    }
  };

  if (!isOpen) return null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchQuery);
  };

  const handleSelect = async (candidate: ImageCandidate) => {
    setIsApplying(true);
    try {
      setSelectedUrl(candidate.imageUrl);
      await onSelectImage({
        imageUrl: candidate.imageUrl,
        imageSource: candidate.source,
        imageSearchQuery: searchQuery,
        imagePageUrl: candidate.pageUrl || null,
        imageAuthor: candidate.author || null,
      });
      onClose();
    } catch (err) {
      console.error("Failed to select image:", err);
    } finally {
      setIsApplying(false);
    }
  };

  const handleApplyCustomUrl = async () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    setIsApplying(true);
    try {
      setSelectedUrl(trimmed);
      await onSelectImage({
        imageUrl: trimmed,
        imageSource: "MANUAL",
        imageSearchQuery: searchQuery,
      });
      onClose();
    } catch (err) {
      console.error("Failed to apply custom url:", err);
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemoveImage) return;
    setIsApplying(true);
    try {
      // Clean up local file if stored on server
      if (currentImageUrl && currentImageUrl.startsWith("/uploads/cards/")) {
        await fetch(`/api/upload/image?url=${encodeURIComponent(currentImageUrl)}`, {
          method: "DELETE",
        }).catch((err) => console.warn("Could not delete local file on remove:", err));
      }
      await onRemoveImage();
      onClose();
    } catch (err) {
      console.error("Failed to remove image:", err);
    } finally {
      setIsApplying(false);
    }
  };

  const quickPills = [
    { label: `${term} illustration`, query: `${term} illustration` },
    { label: `${term} clipart`, query: `${term} clipart` },
    { label: `${term}`, query: term },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onPaste={handleModalPaste}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#FFFDF9] rounded-2xl border-3 border-[#221C16] shadow-[6px_6px_0px_#221C16] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Chọn hình ảnh minh họa cho thẻ"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-[#221C16] bg-[#FAF6EE]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#E06B43] border-2 border-[#221C16] flex items-center justify-center text-white shadow-[2px_2px_0px_#221C16]">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-[#221C16] tracking-tight">
                Chọn ảnh cho: <span className="text-[#E06B43]">&ldquo;{term}&rdquo;</span>
              </h2>
              <p className="text-xs text-[#6B6258] font-medium">
                Tìm ảnh web, tải ảnh từ máy tính hoặc nhấn <kbd className="px-1.5 py-0.5 bg-white border border-[#221C16] rounded font-mono text-[10px] font-bold">Ctrl + V</kbd> để dán
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isApplying || isUploading}
            className="p-1.5 rounded-lg border-2 border-transparent hover:border-[#221C16] hover:bg-[#FAF6EE] text-[#6B6258] hover:text-[#221C16] transition-all disabled:opacity-50"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b-2 border-[#221C16] bg-[#F4EFE6] px-5 gap-3">
          <button
            onClick={() => setActiveTab("search")}
            className={`py-2.5 text-xs font-bold border-b-3 transition-all flex items-center gap-1.5 ${
              activeTab === "search"
                ? "border-[#E06B43] text-[#221C16]"
                : "border-transparent text-[#6B6258] hover:text-[#221C16]"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Tìm ảnh web
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            className={`py-2.5 text-xs font-bold border-b-3 transition-all flex items-center gap-1.5 ${
              activeTab === "upload"
                ? "border-[#E06B43] text-[#221C16]"
                : "border-transparent text-[#6B6258] hover:text-[#221C16]"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Tải lên / Ctrl + V
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            className={`py-2.5 text-xs font-bold border-b-3 transition-all flex items-center gap-1.5 ${
              activeTab === "custom"
                ? "border-[#E06B43] text-[#221C16]"
                : "border-transparent text-[#6B6258] hover:text-[#221C16]"
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            Dán URL
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "search" ? (
            <>
              {/* Search input bar */}
              <form onSubmit={handleSearchSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6258]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nhập từ khóa tìm ảnh..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-[#FAF6EE] border-2 border-[#221C16] rounded-xl shadow-[2px_2px_0px_#221C16] font-medium text-[#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !searchQuery.trim()}
                  className="brick-button-primary px-4 py-2 text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Tìm kiếm
                </button>
              </form>

              {/* Quick suggestion pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-[#6B6258] flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#E06B43]" /> Gợi ý:
                </span>
                {quickPills.map((pill) => (
                  <button
                    key={pill.query}
                    type="button"
                    onClick={() => {
                      setSearchQuery(pill.query);
                      performSearch(pill.query);
                    }}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border border-[#221C16] transition-all ${
                      searchQuery.toLowerCase() === pill.query.toLowerCase()
                        ? "bg-[#E06B43] text-white shadow-[1px_1px_0px_#221C16]"
                        : "bg-[#FAF6EE] text-[#221C16] hover:bg-[#FEF3C7]"
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Content states */}
              {isLoading ? (
                <div className="py-14 flex flex-col items-center justify-center gap-2.5 text-[#6B6258]">
                  <Loader2 className="w-8 h-8 animate-spin text-[#E06B43]" />
                  <p className="text-xs font-bold">Đang tìm ảnh minh họa trên web...</p>
                </div>
              ) : error ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-xs font-semibold text-[#B45309]">{error}</p>
                  <p className="text-[11px] text-[#6B6258]">
                    Bạn có thể thử tìm từ khóa khác hoặc chuyển sang tab &ldquo;Tải lên / Ctrl + V&rdquo;.
                  </p>
                </div>
              ) : images.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {images.map((cand, idx) => {
                    const isSelected = selectedUrl === cand.imageUrl;
                    return (
                      <div
                        key={`${cand.imageUrl}-${idx}`}
                        onClick={() => !isApplying && handleSelect(cand)}
                        className={`group relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all duration-150 aspect-4/3 bg-[#F4EFE6] ${
                          isSelected
                            ? "border-[#E06B43] ring-3 ring-[#E06B43]/30 shadow-[3px_3px_0px_#221C16]"
                            : "border-[#221C16] hover:border-[#E06B43] hover:shadow-[3px_3px_0px_#221C16]"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={cand.thumbnailUrl || cand.imageUrl}
                          alt={cand.title}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                        {/* Selected badge */}
                        {isSelected && (
                          <div className="absolute top-1.5 left-1.5 bg-[#E06B43] text-white p-1 rounded-full border border-[#221C16] shadow-sm">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-white">
                          <p className="text-[11px] font-bold line-clamp-1">{cand.title}</p>
                          <span className="text-[9px] text-gray-200">{cand.source}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : activeTab === "upload" ? (
            /* Upload & Paste Tab */
            <div className="space-y-4 py-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadFile(file);
                }}
              />

              <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#221C16] rounded-2xl bg-[#FAF6EE] p-8 text-center cursor-pointer hover:bg-[#FEF3C7] transition-colors flex flex-col items-center justify-center gap-3 group"
              >
                <div className="w-12 h-12 rounded-xl bg-white border-2 border-[#221C16] shadow-[2px_2px_0px_#221C16] flex items-center justify-center group-hover:scale-105 transition-transform">
                  {isUploading ? (
                    <Loader2 className="w-6 h-6 text-[#E06B43] animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6 text-[#221C16]" />
                  )}
                </div>

                <div>
                  <p className="text-sm font-black text-[#221C16]">
                    {isUploading ? "Đang tải ảnh lên máy chủ..." : "Nhấn để chọn tập tin ảnh từ máy"}
                  </p>
                  <p className="text-xs text-[#6B6258] mt-1 font-medium">
                    Hỗ trợ PNG, JPEG, WebP (tối đa 5MB)
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#221C16] rounded-lg text-xs font-bold text-[#E06B43] shadow-[1px_1px_0px_#221C16] mt-1">
                  <Clipboard className="w-3.5 h-3.5" />
                  Mẹo: Bạn có thể nhấn Ctrl + V ngay lúc này để dán ảnh đã copy
                </div>
              </div>

              {uploadError && (
                <div className="p-3 rounded-xl border-2 border-red-500 bg-red-50 text-xs font-bold text-red-700">
                  {uploadError}
                </div>
              )}
            </div>
          ) : (
            /* Custom URL Tab */
            <div className="space-y-4 py-3">
              <div>
                <label className="block text-xs font-bold text-[#221C16] mb-1.5">
                  Đường dẫn hình ảnh (URL)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="flex-1 px-3 py-2 text-sm bg-[#FAF6EE] border-2 border-[#221C16] rounded-xl shadow-[2px_2px_0px_#221C16] font-medium text-[#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCustomUrl}
                    disabled={isApplying || !customUrl.trim()}
                    className="brick-button-primary px-4 py-2 text-xs font-black disabled:opacity-50"
                  >
                    Dùng ảnh này
                  </button>
                </div>
              </div>

              {customUrl.trim() && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-[#6B6258]">Xem trước:</p>
                  <div className="relative w-full h-48 rounded-xl overflow-hidden border-2 border-[#221C16] bg-[#F4EFE6]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={customUrl.trim()}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t-2 border-[#221C16] bg-[#FAF6EE]">
          <div>
            {currentImageUrl && onRemoveImage && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={isApplying || isUploading}
                className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Xóa ảnh khỏi thẻ này
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying || isUploading}
            className="px-4 py-1.5 text-xs font-bold rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
