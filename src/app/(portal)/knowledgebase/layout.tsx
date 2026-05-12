import { KnowledgebaseSeenTracker } from "@/components/portal/knowledgebase-seen-tracker";

export default function KnowledgebaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <KnowledgebaseSeenTracker />
      {children}
    </>
  );
}
