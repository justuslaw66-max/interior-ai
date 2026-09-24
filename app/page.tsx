import { redirect } from "next/navigation";
import { rootStartDesignHref } from "@/lib/start-design-link";

type HomePageProps = {
  searchParams: Promise<{ start?: string | string[]; source?: string | string[] }>;
};

/**
 * `/` opens the editor at Start a new design (audit finding FR1), which shows while the design
 * is untouched. Older `?source=template|blank` links keep their choice.
 */
export default async function HomePage({ searchParams }: HomePageProps) {
  redirect(rootStartDesignHref(await searchParams));
}
