import { redirect } from "next/navigation";

export default async function AdminImportBatchDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/imports/${id}`);
}
