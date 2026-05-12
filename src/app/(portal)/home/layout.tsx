import { HomeFeedSeenTracker } from "@/components/portal/home-feed-seen-tracker";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <HomeFeedSeenTracker />
      {children}
    </>
  );
}
