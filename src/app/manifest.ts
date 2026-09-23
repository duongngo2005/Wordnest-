import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WordNest — Học Từ Vựng Thông Minh",
    short_name: "WordNest",
    description:
      "Ứng dụng học từ vựng tiếng Anh cá nhân với flashcard, ôn tập ngắt quãng và luyện nhớ chủ động.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF6EE",
    theme_color: "#FAF6EE",
    orientation: "portrait",
    categories: ["education", "productivity"],
    lang: "vi",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
