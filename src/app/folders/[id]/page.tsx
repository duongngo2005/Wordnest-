import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { FolderDetailView } from "@/components/folders/FolderDetailView";
import { folderService } from "@/services/vocabulary";

export const revalidate = 0;

interface FolderPageProps {
  params: Promise<{ id: string }>;
}

export default async function FolderPage({ params }: FolderPageProps) {
  const { id } = await params;
  const folder = await folderService.getFolder(id);
  if (!folder) notFound();

  return (
    <div className="min-h-screen bg-[#FAF6EE] selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="px-4 py-6 sm:py-8"><FolderDetailView folder={folder} /></main>
    </div>
  );
}
