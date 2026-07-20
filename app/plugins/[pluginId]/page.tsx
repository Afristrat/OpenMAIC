import { redirect } from 'next/navigation';

interface PluginPageProps {
  params: Promise<{ pluginId: string }>;
}

export default async function PluginPage({ params }: PluginPageProps): Promise<never> {
  const { pluginId } = await params;
  redirect(`/api/plugins/scenes/${encodeURIComponent(pluginId)}`);
}
